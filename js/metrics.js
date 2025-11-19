// Declare variables to hold the full dataset
let fullDataset = [];

// Function to format numbers with commas
const formatter = new Intl.NumberFormat('en-AU');

// Function to populate the year filter from 2008 to 2024 (as requested)
function populateYearFilter(startYear = 2008, endYear = 2024) {
    const filter = document.getElementById('year-filter');
    if (!filter) return;
    
    filter.innerHTML = ''; // Clear existing options
    
    // Add options in descending order
    for (let year = endYear; year >= startYear; year--) {
        const option = document.createElement('option');
        option.value = year.toString();
        option.textContent = year.toString();
        if (year === endYear) {
            option.selected = true; // Default to the latest year (2024)
        }
        filter.appendChild(option);
    }
}

// Function to calculate and display key metrics
function calculateAndDisplayMetrics(data) {
    // Safely get filter values, defaulting to '2024' and 'All'
    const selectedYear = document.getElementById('year-filter') ? document.getElementById('year-filter').value : '2024';
    const selectedJurisdiction = document.getElementById('jurisdiction-filter') ? document.getElementById('jurisdiction-filter').value : 'All';
    
    // 1. Update the displayed year in the metric panel
    const metricYearSpan = document.getElementById('metric-year');
    if (metricYearSpan) {
        metricYearSpan.textContent = selectedYear;
    }

    // 2. Filter data by selected year
    let filteredData = data.filter(d => d.YEAR === selectedYear);
    
    // 3. Filter data by selected jurisdiction (if not 'All')
    if (selectedJurisdiction !== 'All') {
        filteredData = filteredData.filter(d => d.JURISDICTION === selectedJurisdiction);
    }
    
    // 4. Aggregate Metrics
    let totalFines = 0;
    let policeFines = 0;
    let cameraFines = 0;
    let totalArrests = 0;
    let totalCharges = 0;

    filteredData.forEach(d => {
        // Ensure values are numbers
        const fines = +d.FINES || 0;
        
        totalFines += fines;
        totalArrests += +d.ARRESTS || 0;
        totalCharges += +d.CHARGES || 0;

        // Determine if the fine is from Police or Camera based on DETECTION_METHOD
        const detectionMethod = (d.DETECTION_METHOD || '').toLowerCase();
        
        if (detectionMethod.includes('police')) {
            policeFines += fines;
        } else if (detectionMethod.includes('camera')) {
            cameraFines += fines;
        } 
        // Note: Any records not clearly marked as 'police' or 'camera' 
        // are implicitly considered in the total fine count but not split.
    });
    
    // 5. Update the HTML Spans
    const updateSpan = (id, value) => {
        const element = document.getElementById(id);
        if (element) {
            element.textContent = formatter.format(value);
        }
    };
    
    updateSpan('total-fines-metric', totalFines);
    updateSpan('police-fines-metric', policeFines);
    updateSpan('camera-fines-metric', cameraFines);
    updateSpan('arrests-metric', totalArrests);
    updateSpan('charges-metric', totalCharges);
}

// Function to initialize data and set up listeners
function initializeMetrics() {
    // 1. Populate the year filter initially
    populateYearFilter(2008, 2024);

    // 2. Load the actual CSV data
    d3.csv("./data_knime/Processed_speeding_dataset.csv").then(data => {
        // Data cleaning/typing
        fullDataset = data.map(d => ({
            YEAR: d.YEAR,
            JURISDICTION: d.JURISDICTION,
            FINES: +d.FINES,
            ARRESTS: +d.ARRESTS,
            CHARGES: +d.CHARGES,
            DETECTION_METHOD: d.DETECTION_METHOD,
        }));
        
        // Initial display of metrics
        calculateAndDisplayMetrics(fullDataset);

        // 3. Add event listeners to the filters to update metrics
        const jurisdictionFilter = document.getElementById('jurisdiction-filter');
        const yearFilter = document.getElementById('year-filter');

        if (jurisdictionFilter) {
            // Add a passive listener to avoid blocking the main thread
            jurisdictionFilter.addEventListener('change', () => calculateAndDisplayMetrics(fullDataset), { passive: true });
        }
        if (yearFilter) {
            yearFilter.addEventListener('change', () => calculateAndDisplayMetrics(fullDataset), { passive: true });
        }

    }).catch(error => {
        console.error("Error loading Processed_speeding_dataset.csv:", error);
        // Display an error message if the file loading fails
        const totalFinesSpan = document.getElementById('total-fines-metric');
        if (totalFinesSpan) {
            totalFinesSpan.textContent = "Data Error";
        }
    });
}

// Initialize everything on page load
document.addEventListener('DOMContentLoaded', initializeMetrics);