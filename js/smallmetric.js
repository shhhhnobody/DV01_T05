// Handles updating the left-side small metrics panel for Chart 5.
// Single exported function to compute totals and write to a small set of DOM
// elements. This keeps metric calculations centralized and easy to reuse.
export function updateSmallMetrics(finesSeries, arrestsSeries, chargesSeries, totalSeries, formatNumber) {

    // Safety check
    if (!finesSeries || !arrestsSeries || !chargesSeries || !totalSeries) {
        console.warn("small-metric.js: One or more metric series missing.");
        return;
    }

    // Compute totals
    const totalFines = d3.sum(finesSeries, d => d.value);
    const totalArrests = d3.sum(arrestsSeries, d => d.value);
    const totalCharges = d3.sum(chargesSeries, d => d.value);
    // Note: variable name retains 'totalOffences' to match existing UI/CSV
    // terminology in code; display text can be updated elsewhere to 'enforcements'.
    const totalOffences = d3.sum(totalSeries, d => d.value);

    // Update "Total Fines" (big number on top)
    d3.select('#total-fines-metric').text(formatNumber(totalOffences));

    // Update police-issued total (mirroring total offences)
    d3.select('#police-fines-metric').text(formatNumber(totalOffences));

    // Standard metric boxes
    d3.select('#fines-metric').text(formatNumber(totalFines));
    d3.select('#arrests-metric').text(formatNumber(totalArrests));
    d3.select('#charges-metric').text(formatNumber(totalCharges));
}
