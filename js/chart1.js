// chart1.js
// D3.js stacked bar chart for Chart 1

// Set chart dimensions
const margin = { top: 50, right: 110, bottom: 50, left: 60 },
    width = 1100 - margin.left - margin.right,
    height = 500 - margin.top - margin.bottom;

// Append SVG
const svg = d3.select(".chart-area")
    .append("svg")
    .attr("width", width + margin.left + margin.right)
    .attr("height", height + margin.top + margin.bottom)
    .append("g")
    .attr("transform", `translate(${margin.left},${margin.top})`);

// Create tooltip div
const tooltip = d3.select("body")
    .append("div")
    .attr("class", "tooltip")
    .style("opacity", 0);

// Set color scale for age groups
const color = d3.scaleOrdinal()
    .domain(["0-16", "17-25", "26-39", "40-64", "65 and over", "Unknown"])
    .range([
        "#79bbcc", // 0-16
        "#004261", // 17-25
        "#656d72", // 26-39
        "#0d96cc", // 40-64
        "#d0839b", // 65+
        "#c13960"  // Unknown
    ]);

// Function to format numbers with commas
const formatter = new Intl.NumberFormat('en-AU');

// Function to update the metrics panel
function updateMetrics(filteredData, offenseType) {
    let totalFines = 0, totalArrests = 0, totalCharges = 0;
    const ageGroupTotals = {};

    filteredData.forEach(d => {
        const fines = +d.FINES || 0;
        const arrests = +d.ARRESTS || 0;
        const charges = +d.CHARGES || 0;
        const age = d.AGE_GROUP || "Unknown";

        // Total fines always from **full dataset**, not filtered by age
        totalFines += fines;

        // Arrests and charges are filtered sums
        totalArrests += arrests;
        totalCharges += charges;

        // Track sum by age group for contribution metric
        if (!ageGroupTotals[age]) ageGroupTotals[age] = 0;

        if (offenseType === "Fines (log)" || offenseType === "Fines") {
            ageGroupTotals[age] += fines;
        } else if (offenseType === "Arrests") {
            ageGroupTotals[age] += arrests;
        } else if (offenseType === "Charges") {
            ageGroupTotals[age] += charges;
        }
    });

    const topAgeGroup = Object.entries(ageGroupTotals)
        .sort((a, b) => b[1] - a[1])[0]?.[0] || "N/A";

    const updateSpan = (id, value) => {
        const el = document.getElementById(id);
        if (el) el.textContent = typeof value === "number" ? formatter.format(value) : value;
    };

    updateSpan('contribution-metric', topAgeGroup);
    updateSpan('fines-metric', totalFines);     // always sum of fines
    updateSpan('arrests-metric', totalArrests);
    updateSpan('charges-metric', totalCharges);
}


// Load CSV data
d3.csv("data_knime/chart1_dataset.csv", d3.autoType).then(data => {
    updateMetrics(data, "Fines (log)");
    // Initial render without filters
    updateChart(data);

    // Filter listeners
    d3.selectAll("#age-filter, #jurisdiction-filter, #location-filter, #offense-type-filter").on("change", function() {
        let ageVal = d3.select("#age-filter").property("value");
        let jurVal = d3.select("#jurisdiction-filter").property("value");
        let locVal = d3.select("#location-filter").property("value");
        let offVal = d3.select("#offense-type-filter").property("value");

        // Build filtered data according to selected filters
        let filteredData = data.filter(d => 
            (ageVal === "" || d.AGE_GROUP === ageVal) &&
            (jurVal === "All" || d.JURISDICTION === jurVal) &&
            (locVal === "" || d.LOCATION === locVal)
        );
        
        
        // Update metrics panel 
        updateMetrics(filteredData, offVal);

        // Determine which column to sum for Y axis
        const valueCol = offVal === "Fines (log)" || offVal === "" ? "FINES_log" :
                         offVal === "Arrests" ? "ARRESTS" : "CHARGES";

        // Decide x-axis breakdown:
        // - If a jurisdiction is selected and NO location is selected -> show each location on x-axis
        // - Otherwise (no filters, only location selected, or both selected) -> show jurisdictions on x-axis
        const xBy = (jurVal !== "All" && locVal === "") ? 'location' : 'jurisdiction';

        updateChart(filteredData, valueCol, xBy, jurVal, locVal);
    });
});

// Function to aggregate and render the chart
function updateChart(data, valueCol = "FINES_log", xBy = 'jurisdiction', jurSelected = "All", locSelected = "") {
    svg.selectAll("*").remove(); // Clear previous chart
    const keyAccessor = d => (xBy === 'jurisdiction' ? d.JURISDICTION : d.LOCATION);

    // Get selected offense
    const offVal = d3.select("#offense-type-filter").property("value") || "Fines (log)";

    // Map offense to correct columns
    let stackCol, rawCol;
    if (offVal === "Fines (log)" || offVal === "") {
        stackCol = "FINES_log";
        rawCol = "FINES";
    } else if (offVal === "Arrests") {
        stackCol = "ARRESTS";
        rawCol = "ARRESTS";
    } else if (offVal === "Charges") {
        stackCol = "CHARGES";
        rawCol = "CHARGES";
    }

    // Aggregate data for stacked chart
    const nested = d3.rollup(
        data,
        v => d3.sum(v, d => d[stackCol]),
        keyAccessor,
        d => d.AGE_GROUP
    );

    // Aggregate raw sum for tooltip
    const nestedRaw = d3.rollup(
        data,
        v => d3.sum(v, d => d[rawCol]),
        keyAccessor,
        d => d.AGE_GROUP
    );

    const keys = Array.from(nested.keys());
    const ageGroups = ["0-16", "17-25", "26-39", "40-64", "65 and over", "Unknown"];

    const stackedData = keys.map(k => {
        const obj = { _key: k };
        ageGroups.forEach(age => {
            obj[age] = nested.get(k)?.get(age) || 0;
        });
        return obj;
    });

    const stack = d3.stack().keys(ageGroups)(stackedData);

    const x = d3.scaleBand().domain(keys).range([0, width]).padding(0.2);
    const y = d3.scaleLinear()
        .domain([0, d3.max(stackedData, d => ageGroups.reduce((sum, key) => sum + d[key], 0)) * 1.1])
        .range([height, 0]);

    svg.append("g").attr("transform", `translate(0,${height})`).call(d3.axisBottom(x));
    svg.append("g").call(d3.axisLeft(y));

    // Horizontal grid lines
    svg.append("g")
        .attr("class", "y-grid")
        .call(d3.axisLeft(y).tickSize(-width).tickFormat("").ticks(5))
        .selectAll("line").attr("stroke", "#e5e7eb").attr("stroke-width", 1);
    svg.selectAll('.y-grid path').remove();

    // Draw stacked bars
    const layers = svg.selectAll("g.layer")
        .data(stack)
        .enter()
        .append("g")
        .attr("class", "layer")
        .attr("fill", d => color(d.key));

    const rects = layers.selectAll("rect")
        .data(d => d)
        .enter()
        .append("rect")
        .attr("x", d => x(d.data._key))
        .attr("y", y(0))
        .attr("height", 0)
        .attr("width", x.bandwidth())
        .on("mouseover", function (event, d) {
            const ageGroup = d3.select(this.parentNode).datum().key;
            const key = d.data._key;

            const sumStacked = nested.get(key)?.get(ageGroup) ?? 0;
            const sumRaw = nestedRaw.get(key)?.get(ageGroup) ?? 0;

            svg.selectAll("rect").transition().duration(150).style("opacity", 0.5);

            d3.select(this).raise()
                .transition().duration(150)
                .style("opacity", 1)
                .attr("stroke", "#004261")
                .attr("stroke-width", 1);

            tooltip.transition().duration(150).style("opacity", 1);
            tooltip.html(`
                <strong>${key}</strong><br>
                <strong>Age Group:</strong> ${ageGroup}<br>
                <strong>${offVal} (stacked sum):</strong> ${sumStacked.toFixed(2)}<br>
                <strong>${offVal} (sum):</strong> ${sumRaw}
            `)
            .style("left", (event.pageX + 15) + "px")
            .style("top", (event.pageY - 28) + "px");
        })
        .on("mousemove", event => {
            tooltip.style("left", (event.pageX + 15) + "px").style("top", (event.pageY - 28) + "px");
        })
        .on("mouseout", function () {
            svg.selectAll("rect").transition().duration(150).style("opacity", 1).attr("stroke", null).attr("stroke-width", null);
            tooltip.transition().duration(150).style("opacity", 0);
        });

    rects.transition()
        .duration(900)
        .delay((d, i) => i * 10)
        .attr("y", d => y(d[1]))
        .attr("height", d => y(d[0]) - y(d[1]));

    // Legend
    const legend = svg.append("g").attr("transform", `translate(${width - 10}, 0)`);
    ageGroups.forEach((age, i) => {
        const g = legend.append("g").attr("transform", `translate(0, ${i*20})`);
        g.append("rect").attr("width", 15).attr("height", 15).attr("fill", color(age));
        g.append("text").attr("x", 20).attr("y", 12).text(age);
    });

    // Update chart title
    let title = `Stacked ${offVal} by `;
    if (xBy === 'jurisdiction') {
        title += "Jurisdiction and Age Group";
        if (locSelected !== "") title += ` (Location: ${locSelected})`;
    } else if (xBy === 'location') {
        title += "Location and Age Group";
        if (jurSelected !== "All") title += ` (Jurisdiction: ${jurSelected})`;
    }
    document.getElementById("chart-title").textContent = title;
}

