// Data source: ./data_knime/chart5_dataset.csv

const dataPath = './data_knime/chart5_dataset.csv';
let rawData = null;

console.log('chart5.js module loaded');
if (typeof d3 === 'undefined') console.error('D3 not found: make sure d3.v7 is loaded before chart5.js');

function parseRow(d) {
    return {
        YEAR: +d.YEAR,
        LOCATION_UPDATED: d.LOCATION_UPDATED,
        FINE_COUNTS: +d.FINE_COUNTS || 0,
        ARREST_COUNTS: +d.ARREST_COUNTS || 0,
        CHARGES_COUNTS: +d.CHARGES_COUNTS || 0,
        TOAL_OFFENCES: +d.TOAL_OFFENCES || 0
    };
}

function formatNumber(n) { return new Intl.NumberFormat('en-AU').format(n); }

function renderBarChart(svgSelector, series, opts = {}) {
    const svg = d3.select(svgSelector);
    svg.selectAll('*').remove();

    if (!series || !series.length) {
        // show friendly message in the svg if no data
        const noDataText = 'the dataset does not have this criteria recorded';
        try {
            const container = svg.node();
            const bbox = container.getBoundingClientRect();
            svg.append('text')
                .attr('x', 10)
                .attr('y', 20)
                .attr('fill', '#666')
                .style('font-size', '14px')
                .text(noDataText);
            try { document.getElementById('chart5-status').innerText = noDataText; } catch(e) {}
        } catch (err) {
            console.warn('Unable to render no-data message', err);
        }
        return;
    }

    const container = svg.node();
    const bbox = container.getBoundingClientRect();
    const margin = { top: 20, right: 10, bottom: 80, left: 80 };
    const width = Math.max(300, bbox.width) - margin.left - margin.right;
    const height = (parseInt(svg.attr('height')) || 420) - margin.top - margin.bottom;

    const g = svg.attr('viewBox', `0 0 ${width + margin.left + margin.right} ${height + margin.top + margin.bottom}`)
        .append('g').attr('transform', `translate(${margin.left},${margin.top})`);

    const x = d3.scaleBand().domain(series.map(d => d.key)).range([0, width]).padding(0.2);
    const y = d3.scaleLinear().domain([0, d3.max(series, d => d.value) || 1]).nice().range([height, 0]);

    const xAxis = d3.axisBottom(x);
    const yAxis = d3.axisLeft(y).ticks(6, 's');

    g.append('g').attr('transform', `translate(0,${height})`).call(xAxis)
        .selectAll('text').attr('transform', 'rotate(-30)').style('text-anchor', 'end');
    g.append('g').call(yAxis);

    const bars = g.selectAll('.bar').data(series).enter().append('rect')
        .attr('class', 'bar')
        .attr('x', d => x(d.key))
        .attr('width', x.bandwidth())
        .attr('y', d => y(0))
        .attr('height', 0)
        .attr('fill', opts.fill || '#1f77b4');

    bars.transition().duration(600).attr('y', d => y(d.value)).attr('height', d => Math.max(0, height - y(d.value)));

    g.selectAll('.label').data(series).enter().append('text')
        .attr('class', 'label')
        .attr('x', d => x(d.key) + x.bandwidth() / 2)
        .attr('y', d => y(d.value) - 6)
        .attr('text-anchor', 'middle')
        .style('font-size', '11px')
        .text(d => d.value > 0 ? formatNumber(d.value) : '');

    let tooltip = d3.select('body').select('.tooltip');
    if (tooltip.empty()) tooltip = d3.select('body').append('div').attr('class', 'tooltip').style('opacity', 0);

    bars.on('mouseover', (event, d) => tooltip.style('opacity', 1).html(`<strong>${d.key}</strong><br/>${formatNumber(d.value)}`))
        .on('mousemove', (event) => tooltip.style('left', (event.pageX + 10) + 'px').style('top', (event.pageY - 28) + 'px'))
        .on('mouseout', () => tooltip.style('opacity', 0));
}

function buildSeriesForYear(data, metric, year, locationFilter) {
    let filtered = data.filter(d => d.YEAR === year);
    if (locationFilter && locationFilter !== 'All') filtered = filtered.filter(d => d.LOCATION_UPDATED === locationFilter);
    const roll = Array.from(d3.rollup(filtered, v => d3.sum(v, d => d[metric]), d => d.LOCATION_UPDATED), ([key, value]) => ({ key, value }));
    roll.sort((a, b) => b.value - a.value);
    return roll;
}

function drawSingleChart(year, metricKey = 'TOAL_OFFENCES', locationFilter = 'All') {
    if (!rawData) return;
    const labels = {
        'TOAL_OFFENCES': 'Total Offences',
        'FINE_COUNTS': 'Fines',
        'CHARGES_COUNTS': 'Charges',
        'ARREST_COUNTS': 'Arrests'
    };

    const series = buildSeriesForYear(rawData, metricKey, year, locationFilter);
    const colorMap = { 'TOAL_OFFENCES': '#9467bd', 'FINE_COUNTS': '#1f77b4', 'CHARGES_COUNTS': '#ff7f0e', 'ARREST_COUNTS': '#2ca02c' };

    try {
        renderBarChart('#chart5-single', series, { fill: colorMap[metricKey] || '#1f77b4' });
    } catch (err) {
        console.error('Error rendering chart:', err);
        // attempt to show error in svg
        try { d3.select('#chart5-single').append('text').attr('x',10).attr('y',20).attr('fill','#900').text('Chart render error'); } catch (e) {}
        try { document.getElementById('chart5-status').innerText = 'Chart render error (see console)'; } catch(e) {}
    }

    d3.select('#chart5-subtitle').text(`${labels[metricKey] || metricKey} by Location`);
    d3.select('#chart5-title').text(`${labels[metricKey] || metricKey} — ${year}`);
    d3.select('#metric-year').text(year);

    const totalMetric = d3.sum(series, d => d.value);
    const top = (series && series.length) ? series[0] : null;
    if (top) d3.select('#highest-location').text(`${formatNumber(top.value)} (${top.key} Area)`);
    else d3.select('#highest-location').text('N/A');

    d3.select('#police-fines-metric').text(formatNumber(totalMetric));

    // update other small metrics for context
    d3.select('#fines-metric').text(formatNumber(d3.sum(buildSeriesForYear(rawData, 'FINE_COUNTS', year, locationFilter), d => d.value)));
    d3.select('#charges-metric').text(formatNumber(d3.sum(buildSeriesForYear(rawData, 'CHARGES_COUNTS', year, locationFilter), d => d.value)));
    d3.select('#arrests-metric').text(formatNumber(d3.sum(buildSeriesForYear(rawData, 'ARREST_COUNTS', year, locationFilter), d => d.value)));
}

// Initialization
d3.csv(dataPath, parseRow).then(data => {
    console.log('chart5: CSV loaded, rows=', data.length);
    rawData = data;
    // show years in descending order (newest first)
    const years = Array.from(new Set(data.map(d => d.YEAR))).sort((a, b) => b - a);
    const locations = Array.from(new Set(data.map(d => d.LOCATION_UPDATED))).sort();

    // populate year filter
    const yearSelect = d3.select('#year-filter');
    if (!yearSelect.empty()) {
        yearSelect.selectAll('option').remove();
        years.forEach(y => yearSelect.append('option').attr('value', y).text(y));
        // default to the most recent year (first in descending-sorted array)
        yearSelect.node().value = years[0];
    }

    // populate jurisdiction filter
    const locSelect = d3.select('#jurisdiction-filter');
    if (!locSelect.empty()) {
        locations.forEach(l => locSelect.append('option').attr('value', l).text(l));
        locSelect.node().value = 'All';
    }

    // ensure offense-type-filter default exists and shows Total Offences
    const offenseSelect = d3.select('#offense-type-filter');
    if (!offenseSelect.empty()) {
        offenseSelect.selectAll('option').remove();
        offenseSelect.append('option').attr('value','TOAL_OFFENCES').text('Total Offences');
        offenseSelect.append('option').attr('value','FINE_COUNTS').text('Fines');
        offenseSelect.append('option').attr('value','CHARGES_COUNTS').text('Charges');
        offenseSelect.append('option').attr('value','ARREST_COUNTS').text('Arrests');
        offenseSelect.node().value = 'TOAL_OFFENCES';
    }

    // update visible status
    try { document.getElementById('chart5-status').innerText = `Loaded ${data.length} rows`; } catch (e) {}

    // initial draw - choose most recent year by default
    const initialYear = years[0];
    const initialMetric = document.getElementById('offense-type-filter') ? document.getElementById('offense-type-filter').value : 'TOAL_OFFENCES';
    drawSingleChart(initialYear, initialMetric, 'All');

}).catch(err => {
    console.error('Failed to load chart5 data:', err);
    try { document.getElementById('chart5-status').innerText = 'Failed to load data (see console)'; } catch(e) {}
});

function debounce(fn, delay) { let t; return function(...args) { clearTimeout(t); t = setTimeout(() => fn.apply(this, args), delay); }; }

const redraw = debounce(() => {
    const year = Number(document.getElementById('year-filter') ? document.getElementById('year-filter').value : NaN) || (rawData ? d3.max(rawData, d => d.YEAR) : 0);
    const locationFilter = document.getElementById('jurisdiction-filter') ? document.getElementById('jurisdiction-filter').value : 'All';
    const metric = document.getElementById('offense-type-filter') ? document.getElementById('offense-type-filter').value : 'TOAL_OFFENCES';
    drawSingleChart(year, metric, locationFilter);
}, 120);

if (document.getElementById('year-filter')) document.getElementById('year-filter').addEventListener('change', redraw);
if (document.getElementById('jurisdiction-filter')) document.getElementById('jurisdiction-filter').addEventListener('change', redraw);
if (document.getElementById('offense-type-filter')) document.getElementById('offense-type-filter').addEventListener('change', redraw);

window.addEventListener('resize', debounce(() => {
    const year = Number(document.getElementById('year-filter') ? document.getElementById('year-filter').value : NaN) || (rawData ? d3.max(rawData, d => d.YEAR) : 0);
    const locationFilter = document.getElementById('jurisdiction-filter') ? document.getElementById('jurisdiction-filter').value : 'All';
    const metric = document.getElementById('offense-type-filter') ? document.getElementById('offense-type-filter').value : 'TOAL_OFFENCES';
    drawSingleChart(year, metric, locationFilter);
}, 200));

export { drawSingleChart };
