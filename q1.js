const WEATHER_FIELDS = {
  precipitation: "Precipitation",
  temp_max: "Maximum temperature",
  temp_min: "Minimum temperature",
  wind: "Wind"
};

async function loadWeather() {
  // 1. Load the CSV.
  const rows = await d3.csv("data/seattle-weather.csv");

  // 2. Parse dates and convert numeric values.
  const parseDate = d3.utcParse("%Y-%m-%d");

  const weatherData = rows.map(row => ({
    date: parseDate(row.date),
    precipitation: Number(row.precipitation),
    temp_max: Number(row.temp_max),
    temp_min: Number(row.temp_min),
    wind: Number(row.wind),
    weather: row.weather
  }));

  // 3. Confirm that all required observations were loaded.
  if (weatherData.length !== 1461) {
    throw new Error(
      `Expected 1461 rows, but loaded ${weatherData.length}.`
    );
  }

  console.log("Number of rows:", weatherData.length);
  console.table(weatherData.slice(0, 5));

  // 4. Calculate these counts after weatherData exists.
  console.log(
    "Days with wind at or below 5:",
    weatherData.filter(day => day.wind <= 5).length
  );

  console.log(
    "Days with zero precipitation:",
    weatherData.filter(day => day.precipitation === 0).length
  );

  // 5. Draw the static charts using the current function names.
  drawHistogram(weatherData, 10, "#wind-10");
  drawHistogram(weatherData, 20, "#wind-20");

  drawWeatherPie(weatherData);
  drawPrecipitationLine(weatherData);

  // 6. Draw the interactive histogram and connect its controls.
  initializeInteractiveHistogram(weatherData);

  // 7. Update the page status after initialization succeeds.
  d3.select("#status")
    .text(`Loaded ${weatherData.length} daily weather records.`);
}

loadWeather().catch(
    error => {console.error(error);
    document.getElementById("status").textContent =
    `Could not load the data: ${error.message}`;
    }); 

console.log(
    "Days with zero precipitation:",
    weatherData.filter(day => day.precipitation === 0).length
    );

function drawWeatherPie(data) {
  // Arrange the categories so the small-slice labels stay separated.
  const categories = ["rain", "drizzle", "fog", "sun", "snow"];

  // Group the daily records by weather and count each group.
  const counts = d3.rollup(
    data,
    rows => rows.length,
    day => day.weather
  );

  const categoryData = categories.map(category => {
    const count = counts.get(category) ?? 0;

    return {
      category,
      count,
      share: count / data.length
    };
  });

  const formatPercent = d3.format(".1%");

  console.table(
    categoryData.map(d => ({
      category: d.category,
      days: d.count,
      percentage: formatPercent(d.share)
    }))
  );

  console.log(
    "Pie total:",
    d3.sum(categoryData, d => d.count)
  );

  // Set up the SVG.
  const width = 900;
  const height = 460;
  const radius = 150;

  const svg = d3.select("#weather-pie")
    .attr("width", width)
    .attr("height", height)
    .attr("viewBox", `0 0 ${width} ${height}`)
    .style("max-width", "100%")
    .style("height", "auto");

  svg.selectAll("*").remove();

  const plot = svg.append("g")
    .attr("transform", "translate(280,230)");

  const color = d3.scaleOrdinal()
    .domain(categories)
    .range([
      "#4c78a8", // rain
      "#72b7b2", // drizzle
      "#bab0ac", // fog
      "#eeca3b", // sun
      "#b279a2"  // snow
    ]);

  // Convert counts into slice angles.
  const pie = d3.pie()
    .sort(null)
    .value(d => d.count);

  const slices = pie(categoryData);

  // Convert each slice's angles into a drawable SVG shape.
  const arc = d3.arc()
    .innerRadius(0)
    .outerRadius(radius);

  // A second arc supplies positions for labels outside the pie.
  const labelArc = d3.arc()
    .innerRadius(radius + 30)
    .outerRadius(radius + 30);

  // Draw the slices.
  plot.selectAll("path")
    .data(slices)
    .join("path")
    .attr("d", arc)
    .attr("fill", d => color(d.data.category))
    .attr("stroke", "white")
    .attr("stroke-width", 2)
    .append("title")
    .text(d =>
      `${d.data.category}: ${d.data.count} days ` +
      `(${formatPercent(d.data.share)})`
    );

  // Label each slice with its category and percentage.
  plot.selectAll("text")
    .data(slices)
    .join("text")
    .attr(
      "transform",
      d => `translate(${labelArc.centroid(d)})`
    )
    .attr("text-anchor", d =>
      (d.startAngle + d.endAngle) / 2 < Math.PI
        ? "start"
        : "end"
    )
    .attr("dx", d =>
      (d.startAngle + d.endAngle) / 2 < Math.PI
        ? "0.4em"
        : "-0.4em"
    )
    .attr("dy", "0.35em")
    .attr("font-size", 14)
    .text(d =>
      `${d.data.category}: ${formatPercent(d.data.share)}`
    );

  // Add a color legend with the actual counts.
  const legend = svg.append("g")
    .attr("transform", "translate(620,130)")
    .attr("font-size", 14);

  legend.append("text")
    .attr("y", -24)
    .attr("font-weight", "bold")
    .text("Category counts");

  const legendRows = legend.selectAll("g")
    .data(categoryData)
    .join("g")
    .attr("transform", (d, i) => `translate(0,${i * 32})`);

  legendRows.append("rect")
    .attr("width", 14)
    .attr("height", 14)
    .attr("fill", d => color(d.category));

  legendRows.append("text")
    .attr("x", 24)
    .attr("y", 12)
    .text(d => `${d.category}: ${d.count} days`);

  legend.append("text")
    .attr("y", 190)
    .attr("font-weight", "bold")
    .text(`Total: ${data.length} days`);
}

function drawPrecipitationLine(data) {
  // Sort a copy so the original data array stays in its current order.
  const ordered = [...data].sort(
    (a, b) => a.date - b.date
  );

  const width = 1000;
  const height = 420;

  const margin = {
    top: 25,
    right: 25,
    bottom: 65,
    left: 80
  };

  const chartWidth = width - margin.left - margin.right;
  const chartHeight = height - margin.top - margin.bottom;

  const svg = d3.select("#precipitation-line")
    .attr("width", width)
    .attr("height", height)
    .attr("viewBox", `0 0 ${width} ${height}`)
    .style("max-width", "100%")
    .style("height", "auto");

  svg.selectAll("*").remove();

  const plot = svg.append("g")
    .attr(
      "transform",
      `translate(${margin.left},${margin.top})`
    );

  // Map dates to horizontal positions.
  const x = d3.scaleUtc()
    .domain(d3.extent(ordered, day => day.date))
    .range([0, chartWidth]);

  // Map precipitation values to vertical positions.
  const y = d3.scaleLinear()
    .domain([
      0,
      d3.max(ordered, day => day.precipitation)
    ])
    .nice()
    .range([chartHeight, 0]);

  // Describe how each daily record becomes a point on the line.
  const line = d3.line()
    .x(day => x(day.date))
    .y(day => y(day.precipitation));

  // Draw one path through all daily observations.
  plot.append("path")
    .datum(ordered)
    .attr("d", line)
    .attr("fill", "none")
    .attr("stroke", "#4c78a8")
    .attr("stroke-width", 1.2);

  // Show a date label every six months.
  plot.append("g")
    .attr("transform", `translate(0,${chartHeight})`)
    .call(
      d3.axisBottom(x)
        .ticks(d3.utcMonth.every(6))
        .tickFormat(d3.utcFormat("%b %Y"))
    );

  plot.append("g")
    .call(d3.axisLeft(y).ticks(6));

  // Axis labels.
  plot.append("text")
    .attr("x", chartWidth / 2)
    .attr("y", chartHeight + 50)
    .attr("text-anchor", "middle")
    .attr("font-size", 14)
    .text("Date");

  plot.append("text")
    .attr("transform", "rotate(-90)")
    .attr("x", -chartHeight / 2)
    .attr("y", -58)
    .attr("text-anchor", "middle")
    .attr("font-size", 14)
    .text("Precipitation (source units)");

  // Print useful checks for the chart and later interpretation.
  const formatDate = d3.utcFormat("%Y-%m-%d");

  const peak = d3.greatest(
    ordered,
    day => day.precipitation
  );

  console.log("Precipitation observations:", ordered.length);

  console.log(
    "Date coverage:",
    formatDate(ordered[0].date),
    "to",
    formatDate(ordered[ordered.length - 1].date)
  );

  console.log(
    "Maximum daily precipitation:",
    peak.precipitation,
    "on",
    formatDate(peak.date)
  );
}

function drawHistogram(data, binCount, svgSelector, field = "wind") {
  // Read whichever numeric field was requested.
  const values = data.map(day => day[field]);

  const minValue = d3.min(values);
  const maxValue = d3.max(values);

  // Recalculate equal-width boundaries for this field.
  const binWidth = (maxValue - minValue) / binCount;

  const boundaries = d3.range(1, binCount).map(
    i => minValue + i * binWidth
  );

  const binGenerator = d3.bin()
    .domain([minValue, maxValue])
    .thresholds(boundaries);

  const bins = binGenerator(values);

  // Inspect the bins and check that every day is included.
  console.table(
    bins.map(bin => ({
      lowerBoundary: bin.x0,
      upperBoundary: bin.x1,
      numberOfDays: bin.length
    }))
  );

  console.log("Number of bins:", bins.length);
  console.log(
    "Days represented:",
    d3.sum(bins, bin => bin.length)
  );

  // 3. Set up the drawing area.
  const width = 600;
  const height = 400;

  const margin = {
    top: 20,
    right: 20,
    bottom: 65,
    left: 75
  };

  const chartWidth = width - margin.left - margin.right;
  const chartHeight = height - margin.top - margin.bottom;

  const svg = d3.select(svgSelector)
    .attr("width", width)
    .attr("height", height)
    .attr("viewBox", `0 0 ${width} ${height}`)
    .style("max-width", "100%")
    .style("height", "auto");

  // Clear this SVG before drawing into it.
  svg.selectAll("*").remove();

  const plot = svg.append("g")
    .attr(
      "transform",
      `translate(${margin.left}, ${margin.top})`
    );

  // 4. Convert data values into positions on the screen.
  const x = d3.scaleLinear()
    .domain([minValue, maxValue])
    .range([0, chartWidth]);

  const y = d3.scaleLinear()
    .domain([0, d3.max(bins, bin => bin.length)])
    .nice()
    .range([chartHeight, 0]);

  // 5. Draw one rectangle for each bin.
  plot.selectAll("rect")
    .data(bins)
    .join("rect")
    .attr("x", bin => x(bin.x0))
    .attr("y", bin => y(bin.length))
    .attr("width", bin => x(bin.x1) - x(bin.x0))
    .attr("height", bin => chartHeight - y(bin.length))
    .attr("fill", "#287f8e")
    .attr("stroke", "white")
    .append("title")
    .text(bin =>
      `${bin.x0.toFixed(2)} to ${bin.x1.toFixed(2)}: ` +
      `${bin.length} days`
    );

  // 6. Draw the horizontal axis.
  plot.append("g")
    .attr("transform", `translate(0, ${chartHeight})`)
    .call(d3.axisBottom(x));

  // 7. Draw the vertical axis.
  plot.append("g")
    .call(
      d3.axisLeft(y)
        .ticks(6)
        .tickFormat(d3.format("d"))
    );

  // 8. Label the horizontal axis.
  plot.append("text")
    .attr("x", chartWidth / 2)
    .attr("y", chartHeight + 50)
    .attr("text-anchor", "middle")
    .attr("font-size", 14)
    .text(`${WEATHER_FIELDS[field]} (source units)`);

  // 9. Label the vertical axis.
  plot.append("text")
    .attr("transform", "rotate(-90)")
    .attr("x", -chartHeight / 2)
    .attr("y", -55)
    .attr("text-anchor", "middle")
    .attr("font-size", 14)
    .text("Number of days");

    return {
  binCount: bins.length,
  count: d3.sum(bins, bin => bin.length),
  min: minValue,
  max: maxValue,
  binWidth
};
} 

function initializeInteractiveHistogram(data) {
  const variableSelect = d3.select("#histogram-variable");
  const binSelect = d3.select("#histogram-bins");

  const formatNumber = d3.format(".3~f");

  function update() {
    // Read both current selections.
    const field = variableSelect.property("value");
    const binCount = Number(binSelect.property("value"));

    // Draw the chart and receive its calculated summary.
    const summary = drawHistogram(
      data,
      binCount,
      "#histogram-dynamic",
      field
    );

    d3.select("#histogram-title")
      .text(
        `${WEATHER_FIELDS[field]}: ` +
        `${summary.binCount} equal-width bins`
      );

    d3.select("#histogram-summary")
      .text(
        `Showing ${summary.count} of ${data.length} days. ` +
        `Range: ${summary.min} to ${summary.max} source units. ` +
        `Bin width ≈ ${formatNumber(summary.binWidth)}.`
      );
  }

  // Run the same update whenever either dropdown changes.
  variableSelect.on("change", update);
  binSelect.on("change", update);

  // Draw the initial chart when the data finishes loading.
  update();
}