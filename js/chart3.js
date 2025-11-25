// chart3.js
// D3.js map + small horizontal bar chart

const chartArea = d3.select(".chart-area");

// ---- Global Sizes ----
let svgWidth = 1000;         // overall SVG width
let svgHeight = 700;         // height
let barWidth = 250;          // bar chart width (left)
let barHeight = 220;         // bar chart height (bottom-left)
let mapPaddingLeft = barWidth + 40;  // shift map right

// Create SVG
const svg = chartArea.append("svg")
    .attr("width", svgWidth)
    .attr("height", svgHeight)
    .style("overflow", "visible");

const mapGroup = svg.append("g")
    .attr("class", "map-group")
    .attr("transform", `translate(${mapPaddingLeft}, 0)`);

const barGroup = svg.append("g")
    .attr("class", "bar-group")
    .attr("transform", `translate(10, 10)`);

const tooltip = d3.select("body")
    .append("div")
    .attr("class", "tooltip")
    .style("display", "none");

// Color scale
const color = d3.scaleSequential(d3.interpolateBlues);

// Global holders
let geojson, dataset;


// Map state names to abbreviations
const mapping = {
    "New South Wales": "NSW",
    "Victoria": "VIC",
    "Queensland": "QLD",
    "South Australia": "SA",
    "Western Australia": "WA",
    "Tasmania": "TAS",
    "Northern Territory": "NT",
    "Australian Capital Territory": "ACT"
};

// Load files
Promise.all([
    d3.json("assets/australian-states.json"),
    d3.csv("data_knime/chart3_dataset.csv", d3.autoType)
]).then(([geo, data]) => {
    geojson = geo;
    dataset = data;

    populateYearDropdown();
    updateAll();
});

// Populate year dropdown (idempotent)
function populateYearDropdown() {
    const years = [...new Set(dataset.map(d => d.YEAR))].map(y => String(y).trim()).sort();
    const yearSelect = document.getElementById("year-filter");
    if (!yearSelect) return;

    // Only populate if empty to avoid duplicates from multiple chart scripts
    if (yearSelect.options.length === 0) {
        years.forEach(y => {
            const opt = document.createElement("option");
            opt.value = y;
            opt.textContent = y;
            yearSelect.appendChild(opt);
        });
    }

    // Default to the latest year available in the dataset
    const latest = years[years.length - 1];
    if (latest !== undefined) {
        if (Array.from(yearSelect.options).some(o => o.value === latest)) {
            yearSelect.value = latest;
        } else if (yearSelect.options.length > 0) {
            yearSelect.selectedIndex = yearSelect.options.length - 1;
        }
    }
}

// MAIN UPDATE
function updateAll() {

    const jur = document.getElementById("jurisdiction-filter").value;
    const loc = document.getElementById("location-filter").value;
    const offense = document.getElementById("offense-type-filter").value;
    const year = document.getElementById("year-filter").value;

    const valueColumn = offense.toUpperCase();

    // Filter dataset
    let filtered = dataset.filter(d => d.YEAR == year);
    if (jur !== "All") filtered = filtered.filter(d => d.JURISDICTION === jur);
    if (loc !== "") filtered = filtered.filter(d => d.LOCATION === loc);

    // --- AGGREGATE FOR MAP (jurisdiction-level) ---
    const mapTotals = d3.rollup(
        filtered,
        v => d3.sum(v, d => d[valueColumn] || 0),
        d => d.JURISDICTION
    );


    geojson.features.forEach(f => {
        const abb = mapping[f.properties.STATE_NAME];
        f.properties.value = mapTotals.get(abb) || 0;
    });

    // Set color scale
    const maxValue = d3.max(geojson.features, d => d.properties.value);
    color.domain([0, maxValue || 1]);

    drawMap();

    // --- AGGREGATE FOR BAR CHART ---
    let barData;

    if (jur === "All") {
        // Show: jurisdictions
        const totals = d3.rollup(
            filtered,
            v => d3.sum(v, d => d[valueColumn] || 0),
            d => d.JURISDICTION
        );

        barData = Array.from(totals, ([key, val]) => ({
            category: key,
            value: val
        }));

    } else {
        // Show: locations within selected jurisdiction
        const totals = d3.rollup(
            filtered,
            v => d3.sum(v, d => d[valueColumn] || 0),
            d => d.LOCATION
        );

        barData = Array.from(totals, ([key, val]) => ({
            category: key || "Unknown",
            value: val
        }));
    }

    drawBarChart(barData);

    // Determine dynamic title based on current filters
    let titleText = "";

    // Offense type (default to Fines if empty)
    const offenseLabel = offense || "Fines";

    // Case 1: All jurisdictions
    if (jur === "All") {
        titleText = `${offenseLabel} by Jurisdiction - ${year}`;
    } else {
        // Jurisdiction selected
        if (!loc) {
            // No location filter
            titleText = `${offenseLabel} in ${jur} - ${year}`;
        } else {
            // Location filter applied
            titleText = `${offenseLabel} in ${loc}, ${jur} - ${year}`;
        }
    }

    // Update the HTML title
    document.getElementById("chart-title").innerText = titleText;

}

// DRAW MAP
function drawMap() {
    mapGroup.selectAll("*").remove();

    const projection = d3.geoMercator()
        .fitSize([svgWidth - mapPaddingLeft - 20, svgHeight], geojson);

    const path = d3.geoPath().projection(projection);

    mapGroup.selectAll("path")
        .data(geojson.features)
        .join("path")
        .attr("d", path)
        .attr("stroke", "#666")
        .attr("fill", d => color(d.properties.value))
        .on("mouseover", function (event, d) {
            const jur = d.properties.value ? d.properties.STATE_NAME : null;
            const abb = mapping[d.properties.STATE_NAME];

            // Dim everything
            svg.selectAll("path").transition().duration(150).style("opacity", 0.4);
            barGroup.selectAll("rect").transition().duration(150).style("opacity", 0.4);

            // Highlight map region
            d3.select(this)
                .raise()
                .transition().duration(150)
                .style("opacity", 1)
                .attr("stroke", "#004261")
                .attr("stroke-width", 2);

            // Highlight matching bar (only when showing jurisdictions)
            if (document.getElementById("jurisdiction-filter").value === "All") {
                barGroup.selectAll("rect")
                    .filter(b => b.category === abb)
                    .raise()
                    .transition().duration(150)
                    .style("opacity", 1)
                    .attr("stroke", "#004261")
                    .attr("stroke-width", 2);
            }

            tooltip.style("display", "block")
                .html(`<strong>${d.properties.STATE_NAME}</strong><br>Value: ${d.properties.value}`)
                .style("left", (event.pageX + 10) + "px")
                .style("top", (event.pageY + 10) + "px");
        })
        .on("mousemove", function (event) {
            tooltip.style("left", (event.pageX + 10) + "px")
                .style("top", (event.pageY + 10) + "px");
        })
        .on("mouseout", function () {

            svg.selectAll("path").transition().duration(150)
                .style("opacity", 1)
                .attr("stroke", "#666")
                .attr("stroke-width", 1);

            barGroup.selectAll("rect").transition().duration(150)
                .style("opacity", 1)
                .attr("stroke", null)
                .attr("stroke-width", null);

            tooltip.style("display", "none");
        });

    drawLegend();
}

// DRAW COLOR LEGEND
function drawLegend() {
    svg.selectAll(".legend").remove();

    const legendWidth = 240;
    const legendHeight = 12;

    const legend = svg.append("g")
        .attr("class", "legend")
        .attr("transform", `translate(110, ${svgHeight - 80})`);

    const defs = svg.append("defs");
    const gradient = defs.append("linearGradient")
        .attr("id", "legend-gradient");

    gradient.selectAll("stop")
        .data(d3.ticks(0, 1, 10))
        .join("stop")
        .attr("offset", d => d)
        .attr("stop-color", d => color(d * color.domain()[1]));

    legend.append("rect")
        .attr("width", legendWidth)
        .attr("height", legendHeight)
        .style("fill", "url(#legend-gradient)")
        .style("stroke", "#333");

    legend.append("text")
        .attr("y", -4)
        .text("Low");

    legend.append("text")
        .attr("x", legendWidth)
        .attr("y", -4)
        .attr("text-anchor", "end")
        .text("High");
}

// DRAW SMALL HORIZONTAL BAR CHART
function drawBarChart(data) {
    barGroup.selectAll("*").remove();

    // Scales
    const x = d3.scaleLinear()
        .domain([0, d3.max(data, d => d.value) || 1])
        .range([0, barWidth - 80]);

    const y = d3.scaleBand()
        .domain(data.map(d => d.category))
        .range([0, barHeight])
        .padding(0.2);

    // Bars - attach handlers first, then animate width
    const bars = barGroup.selectAll("rect")
        .data(data, d => d.category)
        .join("rect")
        .attr("x", 100)
        .attr("y", d => y(d.category))
        .attr("height", y.bandwidth())
        .attr("width", 0)                        // start at 0 for animation
        .attr("fill", "#4a90e2")
        .attr("data-category", d => d.category)
        .on("mouseover", function (event, d) {
            // read current jurisdiction filter state
            const jurFilter = document.getElementById("jurisdiction-filter").value;

            // Dim map and other bars
            svg.selectAll("path").transition().duration(150).style("opacity", 0.4);
            barGroup.selectAll("rect").transition().duration(150).style("opacity", 0.4);

            // Highlight this bar
            d3.select(this)
                .raise()
                .transition().duration(150)
                .style("opacity", 1)
                .attr("stroke", "#004261")
                .attr("stroke-width", 2);

            // Highlight matching state on map if bars represent jurisdictions
            if (jurFilter === "All") {
                mapGroup.selectAll("path")
                    .filter(m => mapping[m.properties.STATE_NAME] === d.category)
                    .raise()
                    .transition().duration(150)
                    .style("opacity", 1)
                    .attr("stroke", "#004261")
                    .attr("stroke-width", 2);
            }

            tooltip.style("display", "block")
                .html(`<strong>${d.category}</strong><br>Value: ${d.value}`)
                .style("left", (event.pageX + 10) + "px")
                .style("top", (event.pageY + 10) + "px");
        })
        .on("mousemove", function (event) {
            tooltip.style("left", (event.pageX + 10) + "px")
                .style("top", (event.pageY + 10) + "px");
        })
        .on("mouseout", function () {
            svg.selectAll("path").transition().duration(150)
                .style("opacity", 1)
                .attr("stroke", "#666")
                .attr("stroke-width", 1);

            barGroup.selectAll("rect").transition().duration(150)
                .style("opacity", 1)
                .attr("stroke", null)
                .attr("stroke-width", null);

            tooltip.style("display", "none");
        });

    // animate bars left-to-right with a staggered delay
    bars.transition()
        .duration(900)
        .delay((d, i) => i * 80)
        .ease(d3.easeCubicOut)
        .attr("width", d => x(d.value));

    // Labels (categories)
    barGroup.selectAll("text.labels")
        .data(data)
        .join("text")
        .attr("class", "labels")
        .attr("x", 95)
        .attr("y", d => y(d.category) + y.bandwidth() / 2)
        .attr("text-anchor", "end")
        .attr("alignment-baseline", "middle")
        .style("font-size", "11px")
        .text(d => d.category);

    // Value labels
    barGroup.selectAll("text.values")
        .data(data)
        .join("text")
        .attr("class", "values")
        .attr("x", d => 100 + x(d.value) + 4)
        .attr("y", d => y(d.category) + y.bandwidth() / 2)
        .attr("alignment-baseline", "middle")
        .style("font-size", "11px")
        .style("opacity", 0)
        .transition()
        .delay(600)      // wait for bar animation
        .style("opacity", 1)
        .text(d => d.value);

    console.log("Bar data values:", data.map(d => d.value));
    console.log("Max value:", d3.max(data, d => d.value));

}

// Filter listeners
["jurisdiction-filter", "location-filter", "offense-type-filter", "year-filter"]
    .forEach(id => {
        document.getElementById(id).addEventListener("change", updateAll);
    });
