const margin = { top: 20, right: 180, bottom: 50, left: 80 }; 
const containerWidth = d3.select("#chart-area").node() ? d3.select("#chart-area").node().getBoundingClientRect().width : 960;
const containerHeight = 600; 

const width = containerWidth - margin.left - margin.right;
const height = containerHeight - margin.top - margin.bottom;

const svg = d3.select("#line-chart")
    .attr("width", containerWidth)
    .attr("height", containerHeight)
    .attr("viewBox", `0 0 ${containerWidth} ${containerHeight}`)
    .append("g")
    .attr("transform", `translate(${margin.left},${margin.top})`);

// Define all jurisdiction keys (Used as default in 'ALL' view)
const allJurisdictionKeys = ['ACT', 'NSW', 'NT', 'QLD', 'SA', 'TAS', 'VIC', 'WA'];
// Define all detection methods 
const allDetectionMethods = ['Camera Issued', 'Police Issued', 'Other'];

// Data source path 
const singleDataPath = './data_knime/chart4_dataset.csv'; 

// Global state to track currently selected lines. 
let activeSelections = new Set();
let allCurrentSeriesNames = []; // To store all available series names for the current chart view

// Utility to create a safe id from an arbitrary name
function sanitizeId(name) {
    if (name === undefined || name === null) return '';
    return String(name).replace(/[^a-zA-Z0-9_-]/g, '_');
}

// Function to format numbers and handle null/zero values
function formatNumber(n) { 
    // Return '—' if value is null, undefined, or 0 (since we treat 0 as not plotted)
    if (n === null || n === undefined || n === 0) return '—'; 
    // Use Intl.NumberFormat for thousands separators, rounding for cleaner display
    return new Intl.NumberFormat('en-AU').format(Math.round(n)); 
}


// Function to draw or update the chart
function drawChart(offenseType, selectedJurisdiction, selectedDetectionMethod) {
    // Clear the existing chart and axis elements
    svg.selectAll('*').remove();
    d3.selectAll(".legend").remove(); 

    // Reset multi-select state when filters change
    activeSelections.clear();
    allCurrentSeriesNames = [];

    const metricKey = offenseType; // e.g., 'FINES', 'ARRESTS', 'CHARGES'
    const titleCaseMetric = metricKey.charAt(0) + metricKey.slice(1).toLowerCase();
    
    // --- Dynamic Chart Configuration & Title ---
    let seriesGroupingKey;
    let chartTitle;
    let colorDomain; // Keys for the color scale

    if (selectedDetectionMethod === 'All') {
        // Group by Detection Method (Camera Issued, Police Issued, Others)
        seriesGroupingKey = 'DETECTION_STD';
        colorDomain = allDetectionMethods;
        
        let jurisdictionText = selectedJurisdiction === 'All' ? 'Across All Jurisdictions' : `in ${selectedJurisdiction}`;
        chartTitle = `Annual ${titleCaseMetric} Trend by Detection Method ${jurisdictionText} (2008-2024)`; 

    } else {
        // Group by Jurisdiction (ACT, NSW, etc.)
        seriesGroupingKey = 'JURISDICTION';
        colorDomain = allJurisdictionKeys;
        
        let methodText = selectedDetectionMethod;
        let jurisdictionText = selectedJurisdiction === 'All' ? 'Across All Jurisdictions' : `in ${selectedJurisdiction}`;
        chartTitle = `Annual ${titleCaseMetric} Trend for ${methodText} ${jurisdictionText} (2008-2024)`; 
    }

    // Update the chart title
    d3.select("#chart-title").text(chartTitle);

    // Data Loading and Processing
    d3.csv(singleDataPath, d => {
        return {
            YEAR: +d.YEAR,
            JURISDICTION: d.JURISDICTION,
            DETECTION_STD: d.DETECTION_STD,
            FINES: +d.FINES || 0,
            ARRESTS: +d.ARRESTS || 0,
            CHARGES: +d.CHARGES || 0,
        };
    }).then(raw_data => { 
        
        // --- FILTERING ---
        let filteredData = raw_data;
        
        // Filter by Jurisdiction (if not 'All')
        if (selectedJurisdiction !== 'All') {
            filteredData = filteredData.filter(d => d.JURISDICTION === selectedJurisdiction);
        }
        
        // Filter by specific Detection Method if selected (and we are NOT grouping by Detection Method)
        if (selectedDetectionMethod !== 'All' && seriesGroupingKey === 'JURISDICTION') {
             filteredData = filteredData.filter(d => d.DETECTION_STD === selectedDetectionMethod);
        }

        // --- AGGREGATION LOGIC ---
        let series = [];
        const nestedData = d3.group(filteredData, d => d[seriesGroupingKey]);
        
        // Create a definitive array of all years in the dataset (2008-2024)
        const allYears = Array.from(new Set(raw_data.map(d => d.YEAR))).sort(d3.ascending);

        nestedData.forEach((seriesData, seriesName) => {
            const annualRollupMap = d3.rollup(seriesData, 
                v => d3.sum(v, d => d[metricKey]), 
                d => d.YEAR 
            ); 

            // Create a complete series array, filling in 0 for missing years
            const completeSeriesValues = allYears.map(year => {
                const value = annualRollupMap.get(year) || 0; 
                return {
                    year: year,
                    value: value
                };
            }).sort((a, b) => a.year - b.year);

            series.push({
                name: seriesName, 
                values: completeSeriesValues
            });
        });
        
        // Filter out series that are entirely 0 or empty for cleaner legend/chart
        series = series.filter(s => d3.sum(s.values, d => d.value) > 0);
        
        // Store all available series names for the current chart view
        allCurrentSeriesNames = series.map(s => s.name);

        // Find maximum value for Y-scale domain
        const maxOffenseValue = d3.max(series, s => d3.max(s.values, d => d.value));

        // Define Scales
        const yearDomain = d3.extent(raw_data, d => d.YEAR); 

        const xScale = d3.scaleLinear()
            .domain(yearDomain) 
            .range([0, width]);

        const yScale = d3.scaleLinear()
            // Ensure domain is at least 1 if max is 0, to prevent division by zero or strange scaling
            .domain([0, Math.max(1, maxOffenseValue * 1.05)]) 
            .range([height, 0]);

        const colorScale = d3.scaleOrdinal()
            .domain(colorDomain) 
            .range(d3.schemeCategory10);
            
        // --- AXES ---
        const xAxis = d3.axisBottom(xScale).tickFormat(d3.format("d")); 
        const yAxis = d3.axisLeft(yScale).ticks(10, "s").tickSizeOuter(0);

        svg.append("g")
            .attr("class", "x axis")
            .attr("transform", `translate(0,${height})`)
            .call(xAxis)
            .call(g => g.select(".domain")) 
            .call(g => g.selectAll(".tick line"));

        svg.append("g")
            .attr("class", "y axis")
            .call(yAxis)
            .call(g => g.select(".domain"))
            .call(g => g.selectAll(".tick line").attr("x2", width))
            .append("text")
            .attr("transform", "rotate(-90)")
            .attr("y", -margin.left + 20)
            .attr("x", -height / 2)
            .attr("class", "y-axis-label")
            .attr("text-anchor", "middle")
            .text(`Total ${metricKey.toLowerCase()} (Count)`); 

        // --- LINE GENERATOR ---
        const line = d3.line()
            .x(d => xScale(d.year))
            // Only draw line segments where the value is greater than zero
            .defined(d => d.value > 0)
            .y(d => yScale(d.value)); 

        // --- DRAW LINES ---
        const seriesGroup = svg.selectAll(".series-group")
            .data(series)
            .enter().append("g")
            .attr("class", "series-group");

        const paths = seriesGroup.append("path")
            .attr("class", "line")
            .attr("d", d => line(d.values))
            .style("stroke", d => colorScale(d.name));
            
        // Line Drawing Animation
        paths
            .attr("stroke-dasharray", function() { return this.getTotalLength() + " " + this.getTotalLength(); })
            .attr("stroke-dashoffset", function() { return this.getTotalLength(); })
            .transition()
            .duration(1500) 
            .ease(d3.easeLinear)
            .attr("stroke-dashoffset", 0);
            
        // Draw Dotted Points
        seriesGroup.selectAll(".dot")
            // Filter to include only points where value > 0
            .data(d => d.values.filter(v => v.value > 0))
            .enter().append("circle")
            .attr("class", "dot")
            .attr("cx", d => xScale(d.year))
            .attr("cy", d => yScale(d.value))
            .attr("r", 0) 
            .style("fill", function(d) {
                return colorScale(d3.select(this.parentNode).datum().name); 
            })
            .style("pointer-events", "none")
            .transition() 
            .delay(1200)
            .duration(300)
            .attr("r", 3.5); 

        // NON-OVERLAPPING END LABELS
        let labels = [];

        series.forEach(d => {
            const lastPoint = d.values[d.values.length - 1];
            // Only add a label if the last point has a value greater than 0
            if (lastPoint && lastPoint.value > 0) {
                labels.push({
                    name: d.name,
                    y: yScale(lastPoint.value), 
                    color: colorScale(d.name),
                    finalY: yScale(lastPoint.value),
                    data: lastPoint
                });
            }
        });

        labels.sort((a, b) => b.y - a.y);

        const minSeparation = 16; 
        let lastY = height - 5; 

        labels.forEach(label => {
            let desiredY = Math.min(label.finalY, lastY - minSeparation);
            label.finalY = desiredY;
            lastY = label.finalY;
        });

        svg.selectAll(".label-annotation")
            .data(labels)
            .enter().append("text")
            .attr("class", "label-annotation")
            .attr("transform", d => `translate(${width + 10}, ${d.finalY})`) 
            .attr("dy", "0.35em")
            .attr("text-anchor", "start")
            .style("fill", d => d.color)
            .text(d => d.name)
            .style("opacity", 0) 
            .transition() 
            .delay(1500) 
            .duration(500)
            .style("opacity", 1);
            
        // --- TOOLTIP AND INTERACTION ---
        let tooltip = d3.select("body").select(".tooltip");
        if (tooltip.empty()) {
            tooltip = d3.select("body").append("div")
                .attr("class", "tooltip")
                .style("opacity", 0);
        }

        const hoverLine = svg.append("line")
            .attr("class", "hover-line")
            .attr("y1", 0)
            .attr("y2", height)
            .style("stroke", "#4b5563")
            .style("stroke-width", "1px")
            .style("stroke-dasharray", "4,2")
            .style("opacity", 0);
        
        svg.append("rect")
            .attr("class", "overlay")
            .attr("width", width)
            .attr("height", height)
            .style("fill", "none")
            .style("pointer-events", "all")
            .on("mouseover", mouseover)
            .on("mousemove", mousemove)
            .on("mouseout", mouseout);

        function mouseover(event) {
            tooltip.style("opacity", 1);
            hoverLine.style("opacity", 1);
        }

        function mousemove(event) {
            const [xPos] = d3.pointer(event);
            const x0 = xScale.invert(xPos); 
            const closestYear = allYears[d3.bisectCenter(allYears, x0)]; 
            
            if (!closestYear) return mouseout();
            
            // 1. Collect all visible series data for the year
            let items = [];
            series.forEach(s => {
                const isLineVisible = activeSelections.size === 0 || activeSelections.has(s.name);

                if (isLineVisible) {
                    const point = s.values.find(v => v.year === closestYear);
                    // Use null if the point is missing or the value is 0
                    const value = (point && point.value > 0) ? point.value : null;

                    items.push({
                        name: s.name, 
                        value: value, 
                        color: colorScale(s.name)
                    });
                }
            });

            // 2. Sort by value (descending, with nulls/zeros at the bottom)
            items.sort((a, b) => (b.value || 0) - (a.value || 0));

            // 3. Build HTML using chart6.js's style
            let tooltipContent = `<div style="font-weight:bold;margin-bottom:6px">${closestYear} ${metricKey.toLowerCase()}</div>`;
            tooltipContent += '<div style="max-height:240px;overflow:auto;">';
            
            items.forEach(it => {
                const display = formatNumber(it.value);
                
                tooltipContent += `<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:4px">`;
                // Name and Color Swatch
                tooltipContent += `<div style="display:flex;align-items:center;gap:8px"><span style="width:12px;height:12px;background:${it.color};display:inline-block;border-radius:2px"></span><span style="min-width:60px">${it.name}</span></div>`;
                // Value (Updated color to white)
                tooltipContent += `<div style="color:#ffffff;font-weight:600;text-align:right">${display}</div>`;
                tooltipContent += `</div>`;
            });
            
            tooltipContent += '</div>';

            // Update Hover Line 
            const hoverX = xScale(closestYear);
            
            hoverLine
                .attr("x1", hoverX)
                .attr("x2", hoverX);

            // Update Tooltip Position and Content 
            const tooltipNode = tooltip.node();
            const tooltipRect = tooltipNode.getBoundingClientRect();
            const tooltipWidth = tooltipRect.width || 120; 
            const tooltipHeight = tooltipRect.height || 60;
            
            const chartAreaRight = d3.select("#chart-area").node().getBoundingClientRect().right;

            let leftPos = event.pageX + 10;
            let topPos = event.pageY - tooltipHeight - 10;
            
            if (event.pageX + tooltipWidth + 20 > chartAreaRight) {
                leftPos = event.pageX - tooltipWidth - 10;
            }

            if (event.pageY < tooltipHeight + 20) {
                 topPos = event.pageY + 20;
            }
            
            tooltip
                .style("left", leftPos + "px")
                .style("top", topPos + "px")
                .html(tooltipContent);
        }

        function mouseout(event) {
            tooltip.style("opacity", 0);
            hoverLine.style("opacity", 0);
        }

        // --- Legend and Multi-Select Logic ---
        const handleLegendClick = (event, d) => {
            const clickedName = d.name;
            const clickedElement = d3.select(event.currentTarget);

            if (activeSelections.has(clickedName)) {
                // If already selected, deselect it
                activeSelections.delete(clickedName);
                clickedElement.classed("opacity-40", false);
            } else {
                // If not selected, select it
                activeSelections.add(clickedName);
                clickedElement.classed("opacity-40", false);
            }

            // If the set of active selections is empty, all lines should be shown.
            // Otherwise, only the selected lines should be shown.
            const shouldShowAll = activeSelections.size === 0;

            d3.selectAll(".series-group") 
                .classed("hidden", dd => {
                    // dd is the data bound to the .series-group (i.e., the series object)
                    return !shouldShowAll && !activeSelections.has(dd.name);
                });

            // Update the opacity of ALL legend items based on the new state
            d3.selectAll(".legend-item")
                .classed("opacity-40", dd => {
                    // dd is the data bound to the legend-item (i.e., the series object)
                    // Dim items if NOT shouldShowAll AND NOT selected
                    return !shouldShowAll && !activeSelections.has(dd.name);
                });
            
            // Manually trigger mousemove to update the tooltip immediately
            const overlay = d3.select(".overlay").node();
            if (overlay) {
                const rect = overlay.getBoundingClientRect();
                const syntheticEvent = new MouseEvent('mousemove', {
                    bubbles: true,
                    cancelable: true,
                    clientX: rect.left + rect.width / 2, 
                    clientY: rect.top + rect.height / 2
                });
                overlay.dispatchEvent(syntheticEvent);
            }
        };

        
        // --- LEGEND ---
        const chartAreaWrapper = d3.select("#chart-area").node().parentNode; 
        const legend = d3.select(chartAreaWrapper).append("div")
            .attr("class", "legend mt-8 flex flex-wrap gap-x-6 gap-y-2 justify-center");
        
        const legendItems = legend.selectAll(".legend-item")
            .data(series)
            .enter().append("div")
            .attr("class", "legend-item flex items-center cursor-pointer")
            .on("click", handleLegendClick) 
            .attr("id", d => `legend-${sanitizeId(d.name)}`); 

        legendItems.append("span")
            .attr("class", "w-4 h-4 rounded-full mr-2 inline-block")
            .style("background-color", d => colorScale(d.name));

        legendItems.append("span")
            .attr("class", "text-sm text-gray-700")
            .text(d => d.name);

        // Apply sanitized IDs to the line groups for toggling
        svg.selectAll(".series-group")
            .attr("id", d => `series-${sanitizeId(d.name)}`);
            
        // Populate the Year filter (only needs to be done once)
        if (d3.select("#year-filter").property("options").length === 0) {
             const yearSelect = d3.select("#year-filter");
             allYears.forEach(year => {
                yearSelect.append("option")
                    .attr("value", year)
                    .text(year)
                    .property("selected", year === d3.max(allYears)); // Select the latest year by default
            });
            // Ensure the initial metric panel update is triggered
            d3.select("#year-filter").dispatchEvent(new Event('change'));
        }

    }).catch(error => {
        console.error(`Error loading or processing data from ${singleDataPath}:`, error);
        d3.select("#chart-area").append("p").attr("class", "text-red-500 p-4").text(`Error loading data from ${singleDataPath}. Please ensure the file is in the correct folder.`);
        d3.select("#chart-title").text(chartTitle + " (Data Failed to Load)");
    });
}

function debounce(func, delay) {
    let timeout;
    return function(...args) {
        const context = this;
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(context, args), delay);
    };
}

// Helper function to fetch current filter values and redraw the chart
function updateChart() {
    const offenseType = d3.select("#speeding-offence-filter").node().value;
    const jurisdiction = d3.select("#jurisdiction-filter").node().value;
    const detectionMethod = d3.select("#detection-method-filter").node().value;
    // The Year filter only impacts the metrics panel, not the chart itself
    
    drawChart(offenseType, jurisdiction, detectionMethod);
}

const debouncedUpdateChart = debounce(updateChart, 50);

// Initial chart draw (delayed to ensure all HTML elements are ready)
setTimeout(updateChart, 100);

// Event Listeners for the Filters
if (d3.select("#speeding-offence-filter").node()) {
    d3.select("#speeding-offence-filter").on("change", debouncedUpdateChart);
}

if (d3.select("#jurisdiction-filter").node()) {
    d3.select("#jurisdiction-filter").on("change", debouncedUpdateChart);
}

if (d3.select("#detection-method-filter").node()) {
    d3.select("#detection-method-filter").on("change", debouncedUpdateChart);
}

// Event listener for year filter (only for metrics, chart itself doesn't update)
if (d3.select("#year-filter").node()) {
}