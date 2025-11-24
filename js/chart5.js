// chart5.js - Implements four bar charts (Fines, Charges, Arrests, Total) by LOCATION_UPDATED
// - Charts are filtered by `#year-filter` (year) and optionally by `#jurisdiction-filter` (location)
// - Data source: ./data_knime/chart5_dataset.csv

const dataPath = './data_knime/chart5_dataset.csv';

let rawData = null;

function parseRow(d) {
    return {
        YEAR: +d.YEAR,
        LOCATION_UPDATED: d.LOCATION_UPDATED,
        FINE_COUNTS: +d.FINE_COUNTS || 0,
        ARREST_COUNTS: +d.ARREST_COUNTS || 0,
        CHARGES_COUNTS: +d.CHARGES_COUNTS || 0,
        TOAL_OFFENCES: +d.TOAL_OFFENCES || 0 // kept as in CSV
    };
}

function formatNumber(n) { return new Intl.NumberFormat('en-AU').format(n); }

// Helper: render a single vertical bar chart into an SVG element
function renderBarChart(svgSelector, series, opts = {}) {
    const svg = d3.select(svgSelector);
    svg.selectAll('*').remove();

    const container = svg.node();
    const bbox = container.getBoundingClientRect();
    const margin = { top: 20, right: 10, bottom: 60, left: 60 };
    const width = Math.max(300, bbox.width) - margin.left - margin.right;
    const height = (parseInt(svg.attr('height')) || 260) - margin.top - margin.bottom;

    const g = svg
        .attr('viewBox', `0 0 ${width + margin.left + margin.right} ${height + margin.top + margin.bottom}`)
        .append('g')
        .attr('transform', `translate(${margin.left},${margin.top})`);

    // X: categories (LOCATION_UPDATED)
    const x = d3.scaleBand().domain(series.map(d => d.key)).range([0, width]).padding(0.2);
    const y = d3.scaleLinear().domain([0, d3.max(series, d => d.value) || 1]).nice().range([height, 0]);

    const xAxis = d3.axisBottom(x);
    const yAxis = d3.axisLeft(y).ticks(5, 's');

    g.append('g').attr('transform', `translate(0,${height})`).call(xAxis)
        .selectAll('text')
        .attr('transform', 'rotate(-25)')
        .style('text-anchor', 'end')
        .style('font-size', '11px');

    g.append('g').call(yAxis);

    // Bars
    const bars = g.selectAll('.bar').data(series, d => d.key).enter()
        .append('rect')
        .attr('class', 'bar')
        .attr('x', d => x(d.key))
        .attr('width', x.bandwidth())
        .attr('y', y(0))
        .attr('height', 0)
        .attr('fill', opts.fill || '#1f77b4');

    bars.transition().duration(600).attr('y', d => y(d.value)).attr('height', d => Math.max(0, height - y(d.value)));

    // Value labels
    g.selectAll('.label').data(series).enter().append('text')
        .attr('class', 'label')
        .attr('x', d => x(d.key) + x.bandwidth() / 2)
        .attr('y', d => y(d.value) - 6)
        .attr('text-anchor', 'middle')
        .style('font-size', '11px')
        .text(d => d.value > 0 ? formatNumber(d.value) : '');

    // Tooltip
    let tooltip = d3.select('body').select('.tooltip');
    if (tooltip.empty()) tooltip = d3.select('body').append('div').attr('class', 'tooltip').style('opacity', 0);

    bars.on('mouseover', (event, d) => {
        tooltip.style('opacity', 1).html(`<strong>${d.key}</strong><br/>${formatNumber(d.value)}`);
    }).on('mousemove', (event) => {
        tooltip.style('left', (event.pageX + 10) + 'px').style('top', (event.pageY - 28) + 'px');
    }).on('mouseout', () => tooltip.style('opacity', 0));
}

// Build series (array of {key, value}) for a given metric and year
function buildSeriesForYear(data, metric, year, locationFilter) {
    let filtered = data.filter(d => d.YEAR === year);
    if (locationFilter && locationFilter !== 'All') filtered = filtered.filter(d => d.LOCATION_UPDATED === locationFilter);

    const roll = Array.from(d3.rollup(filtered, v => d3.sum(v, d => d[metric]), d => d.LOCATION_UPDATED), ([key, value]) => ({ key, value }));
    // Sort descending for consistent presentation
    roll.sort((a, b) => b.value - a.value);
    return roll;
}

// Draw all four charts for selected year
function drawAllCharts(year, locationFilter = 'All') {
    if (!rawData) return;
    const finesSeries = buildSeriesForYear(rawData, 'FINE_COUNTS', year, locationFilter);
    const chargesSeries = buildSeriesForYear(rawData, 'CHARGES_COUNTS', year, locationFilter);
    const arrestsSeries = buildSeriesForYear(rawData, 'ARREST_COUNTS', year, locationFilter);
    const totalSeries = buildSeriesForYear(rawData, 'TOAL_OFFENCES', year, locationFilter);

    renderBarChart('#chart5-fines', finesSeries, { fill: '#1f77b4' });
    renderBarChart('#chart5-charges', chargesSeries, { fill: '#ff7f0e' });
    renderBarChart('#chart5-arrests', arrestsSeries, { fill: '#2ca02c' });
    renderBarChart('#chart5-total', totalSeries, { fill: '#9467bd' });

    // Update title and metrics
    d3.select('#chart5-title').text(`Counts by Location — ${year}`);
    d3.select('#metric-year').text(year);

    // Update small metrics in left panel (example totals)
    const totalFines = d3.sum(finesSeries, d => d.value);
    const totalArrests = d3.sum(arrestsSeries, d => d.value);
    const totalCharges = d3.sum(chargesSeries, d => d.value);
    const totalOffences = d3.sum(totalSeries, d => d.value);

    // Display total offences prominently (large metric) and in the police box
    d3.select('#total-fines-metric').text(formatNumber(totalOffences));
    d3.select('#police-fines-metric').text(formatNumber(totalOffences));

    // Display fines, charges, arrests in their respective boxes
    d3.select('#fines-metric').text(formatNumber(totalFines));
    d3.select('#arrests-metric').text(formatNumber(totalArrests));
    d3.select('#charges-metric').text(formatNumber(totalCharges));
}

// Initialization: load data once and populate filters
try {
    d3.csv(dataPath, parseRow).then(data => {
        rawData = data;
        const years = Array.from(new Set(data.map(d => d.YEAR))).sort((a,b) => a - b);
        const locations = Array.from(new Set(data.map(d => d.LOCATION_UPDATED))).sort();

        // Populate year filter
        const yearSelect = d3.select('#year-filter');
        if (!yearSelect.empty()) {
            yearSelect.selectAll('option').remove();
            years.forEach(y => yearSelect.append('option').attr('value', y).text(y));
            const defaultYear = years[years.length - 1];
            yearSelect.node().value = defaultYear;
        }

        // Populate jurisdiction-filter with LOCATION_UPDATED options (page uses the same ID)
        const locSelect = d3.select('#jurisdiction-filter');
        if (!locSelect.empty()) {
            // Append others while keeping existing "All"
            locations.forEach(l => locSelect.append('option').attr('value', l).text(l));
            locSelect.node().value = 'All';
        }

        // Initial draw for default year
        const initialYear = years[years.length - 1];
        drawAllCharts(initialYear, 'All');

    }).catch(err => {
        console.error('Failed to load chart5 data:', err);
    });
} catch (err) {
    console.error('Unexpected error initializing chart5:', err);
}

function debounce(fn, delay) { let t; return function(...args) { clearTimeout(t); t = setTimeout(() => fn.apply(this, args), delay); }; }

// Wire filters: redraw when year or jurisdiction (location) changes
const debouncedDraw = debounce(() => {
    const year = Number(document.getElementById('year-filter') ? document.getElementById('year-filter').value : NaN) || (rawData ? d3.max(rawData, d => d.YEAR) : 0);
    const locationFilter = document.getElementById('jurisdiction-filter') ? document.getElementById('jurisdiction-filter').value : 'All';
    drawAllCharts(year, locationFilter);
}, 120);

if (document.getElementById('year-filter')) document.getElementById('year-filter').addEventListener('change', debouncedDraw);
if (document.getElementById('jurisdiction-filter')) document.getElementById('jurisdiction-filter').addEventListener('change', debouncedDraw);

// Redraw on window resize for responsiveness
window.addEventListener('resize', debounce(() => {
    const year = Number(document.getElementById('year-filter') ? document.getElementById('year-filter').value : NaN) || (rawData ? d3.max(rawData, d => d.YEAR) : 0);
    const locationFilter = document.getElementById('jurisdiction-filter') ? document.getElementById('jurisdiction-filter').value : 'All';
    drawAllCharts(year, locationFilter);
}, 200));

// Export functions (optional)
export { drawAllCharts };
