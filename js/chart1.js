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

// Load CSV data
d3.csv("data_knime/chart1_dataset.csv", d3.autoType).then(data => {

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
    // Choose primary key (x-axis domain) based on xBy
    const keyAccessor = d => (xBy === 'jurisdiction' ? d.JURISDICTION : d.LOCATION);

    // Aggregate data: sum by AGE_GROUP and the primary key
    const nested = d3.rollup(
        data,
        v => d3.sum(v, d => d[valueCol]),
        keyAccessor,
        d => d.AGE_GROUP
    );

    // Additional rollup for raw FINES
    const nestedRaw = d3.rollup(
        data,
        v => d3.sum(v, d => d.FINES),
        keyAccessor,
        d => d.AGE_GROUP
    );

    const keys = Array.from(nested.keys());
    const ageGroups = ["0-16", "17-25", "26-39", "40-64", "65 and over", "Unknown"];

    // Pivot data to stacked format
    const stackedData = keys.map(k => {
        const obj = {};
        // store primary key under a common property for access when drawing
        obj._key = k;
        ageGroups.forEach(age => {
            obj[age] = nested.get(k)?.get(age) || 0;
        });
        return obj;
    });

    const stack = d3.stack()
        .keys(ageGroups)
        (stackedData);

    // X scale
    const x = d3.scaleBand()
        .domain(keys)
        .range([0, width])
        .padding(0.2);

    svg.append("g")
        .attr("transform", `translate(0,${height})`)
        .call(d3.axisBottom(x));

    // Y scale
    const y = d3.scaleLinear()
        .domain([0, d3.max(stackedData, d => ageGroups.reduce((sum, key) => sum + d[key], 0)) * 1.1])
        .range([height, 0]);

    svg.append("g")
        .call(d3.axisLeft(y));

    // Add horizontal grid lines (rows) behind the chart
    svg.append("g")
        .attr("class", "y-grid")
        .call(d3.axisLeft(y)
            .tickSize(-width)
            .tickFormat("")
            .ticks(5)
        )
        .selectAll("line")
        .attr("stroke", "#e5e7eb")
        .attr("stroke-width", 1);
    // remove the domain/path created by the axis for the grid
    svg.selectAll('.y-grid path').remove();

    // Draw stacked bars
    // Draw stacked bars with enter animation (grow from zero height)
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
        // start at zero height at baseline so we can animate upwards
        .attr("y", y(0))
        .attr("height", 0)
        .attr("width", x.bandwidth())
        .on("mouseover", function (event, d) {
            const ageGroup = d3.select(this.parentNode).datum().key;
            const key = d.data._key;

            // summed values used in the stacked bars
            const sumLog = nested.get(key)?.get(ageGroup) ?? 0;
            const sumFine = nestedRaw.get(key)?.get(ageGroup) ?? 0;

            tooltip.transition().duration(150).style("opacity", 1);

            tooltip.html(`
                <strong>${key}</strong><br>
                <strong>Age Group:</strong> ${ageGroup}<br>
                <strong>Fines (log sum):</strong> ${sumLog.toFixed(2)}<br>
                <strong>Original fines sum:</strong> ${sumFine}
            `)
            .style("left", (event.pageX + 15) + "px")
            .style("top", (event.pageY - 28) + "px");
        })
        .on("mousemove", function (event) {
            tooltip.style("left", (event.pageX + 15) + "px")
                .style("top", (event.pageY - 28) + "px");
        })
        .on("mouseout", function () {
            tooltip.transition().duration(150).style("opacity", 0);
        });

    // Animate bars to their stacked heights
    rects.transition()
        .duration(900)
        .delay((d, i) => i * 10)
        .attr("y", d => y(d[1]))
        .attr("height", d => y(d[0]) - y(d[1]));

    // Add legend
    const legend = svg.append("g")
        .attr("transform", `translate(${width - 10}, 0)`);

    ageGroups.forEach((age, i) => {
        const g = legend.append("g").attr("transform", `translate(0, ${i*20})`);
        g.append("rect").attr("width", 15).attr("height", 15).attr("fill", color(age));
        g.append("text").attr("x", 20).attr("y", 12).text(age);
    });

    // Update chart title
    const offVal = d3.select("#offense-type-filter").property("value") || "Fines (log)";
    // Update chart title based on x-axis and selected filters
    let title = `Stacked ${offVal} by `;

    // CASE 1 — x-axis = Jurisdiction
    if (xBy === 'jurisdiction') {
        title += "Jurisdiction and Age Group";

        // If user selected a location, show it
        if (locSelected !== "") {
            title += ` (Location: ${locSelected})`;
        }

    // CASE 2 — x-axis = Location
    } else if (xBy === 'location') {
        title += "Location and Age Group";

        // If user selected a jurisdiction, show it
        if (jurSelected !== "All") {
            title += ` (Jurisdiction: ${jurSelected})`;
        }
    }

    document.getElementById("chart-title").textContent = title;
}
