const weatherText = {
  0: ["Selge taevas", "☼"], 1: ["Peamiselt selge", "☼"], 2: ["Vahelduv pilvisus", "◒"], 3: ["Pilves", "☁"],
  45: ["Udune", "≋"], 48: ["Härmatisega udu", "≋"], 51: ["Nõrk uduvihm", "⌁"], 53: ["Uduvihm", "⌁"], 55: ["Tugev uduvihm", "⌁"],
  61: ["Nõrk vihm", "⌁"], 63: ["Vihm", "☂"], 65: ["Tugev vihm", "☂"], 71: ["Nõrk lumesadu", "❄"], 73: ["Lumesadu", "❄"], 75: ["Tugev lumesadu", "❄"],
  80: ["Vihmahood", "☂"], 81: ["Vihmahood", "☂"], 82: ["Tugevad vihmahood", "☂"], 95: ["Äike", "ϟ"], 96: ["Äike ja rahe", "ϟ"], 99: ["Äike ja rahe", "ϟ"]
};

const defaultPlace = { name: "Tallinn", country: "Eesti", latitude: 59.437, longitude: 24.7536 };
const elements = {
  location: document.querySelector("#location-name"), temp: document.querySelector("#current-temperature"),
  condition: document.querySelector("#current-condition"), feels: document.querySelector("#feels-like"), humidity: document.querySelector("#humidity"),
  wind: document.querySelector("#wind"), icon: document.querySelector("#current-icon"), forecast: document.querySelector("#forecast-grid"),
  updated: document.querySelector("#updated-label"), coordinates: document.querySelector("#coordinates"), toast: document.querySelector("#toast")
};

function showToast(message) {
  elements.toast.textContent = message;
  elements.toast.classList.add("show");
  window.setTimeout(() => elements.toast.classList.remove("show"), 3200);
}

function getWeatherLabel(code) { return weatherText[code] || ["Muutlik ilm", "☁"]; }

function formatDay(date, index) {
  if (index === 0) return "Täna";
  return new Intl.DateTimeFormat("et-EE", { weekday: "short" }).format(new Date(date)).replace(".", "");
}

function renderForecast(data) {
  elements.forecast.innerHTML = data.daily.time.map((date, index) => {
    const [label, icon] = getWeatherLabel(data.daily.weather_code[index]);
    return `<article class="forecast-day"><p class="day-name">${formatDay(date, index)}</p><div class="day-icon" aria-label="${label}">${icon}</div><p class="day-temp">${Math.round(data.daily.temperature_2m_max[index])}° <span>${Math.round(data.daily.temperature_2m_min[index])}°</span></p></article>`;
  }).join("");
}

async function fetchWeather(place) {
  elements.updated.textContent = "Uuendan andmeid...";
  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.search = new URLSearchParams({ latitude: place.latitude, longitude: place.longitude, current: "temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m", daily: "weather_code,temperature_2m_max,temperature_2m_min", timezone: "auto", forecast_days: 7 });
  const response = await fetch(url);
  if (!response.ok) throw new Error("Ilmaandmeid ei saanud laadida");
  const data = await response.json();
  const current = data.current;
  const [label, icon] = getWeatherLabel(current.weather_code);
  elements.location.textContent = `${place.name}, ${place.country}`;
  elements.temp.textContent = Math.round(current.temperature_2m);
  elements.condition.textContent = label;
  elements.feels.textContent = Math.round(current.apparent_temperature);
  elements.humidity.textContent = `${current.relative_humidity_2m}%`;
  elements.wind.textContent = `${Math.round(current.wind_speed_10m)} km/h`;
  elements.icon.textContent = icon;
  elements.coordinates.textContent = `${Math.abs(place.latitude).toFixed(2)}° ${place.latitude >= 0 ? "N" : "S"} · ${Math.abs(place.longitude).toFixed(2)}° ${place.longitude >= 0 ? "E" : "W"}`;
  elements.updated.textContent = `Uuendatud ${new Intl.DateTimeFormat("et-EE", { hour: "2-digit", minute: "2-digit" }).format(new Date())}`;
  renderForecast(data);
}

async function searchCity(query) {
  const url = new URL("https://geocoding-api.open-meteo.com/v1/search");
  url.search = new URLSearchParams({ name: query, count: 1, language: "et", format: "json" });
  const response = await fetch(url);
  const data = await response.json();
  if (!data.results?.length) throw new Error(`Linna „${query}” ei leitud`);
  return { name: data.results[0].name, country: data.results[0].country, latitude: data.results[0].latitude, longitude: data.results[0].longitude };
}

document.querySelector("#search-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const query = document.querySelector("#city-input").value.trim();
  if (!query) return;
  try { await fetchWeather(await searchCity(query)); } catch (error) { showToast(error.message); elements.updated.textContent = "Otsing ebaõnnestus"; }
});

document.querySelector("#locate-button").addEventListener("click", () => {
  if (!navigator.geolocation) return showToast("Sinu brauser ei toeta asukohta.");
  navigator.geolocation.getCurrentPosition(async ({ coords }) => {
    try { await fetchWeather({ name: "Sinu asukoht", country: "", latitude: coords.latitude, longitude: coords.longitude }); }
    catch { showToast("Selle asukoha ilma ei saanud laadida."); }
  }, () => showToast("Asukoha kasutamine jäi ära."));
});

fetchWeather(defaultPlace).catch(() => { elements.updated.textContent = "Ühendus puudub"; showToast("Ilmaandmeid ei saanud laadida."); });