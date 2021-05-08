(function () {
	const $ = document.querySelector.bind(document);
	const $$ = document.querySelectorAll.bind(document);

	const $currentTemp = $('#current-temperature');
	const $titleWeather = $('#advisement p');
	const $desWeather = $('#advisement span');
	const $currentTime = $('#current-time');
	const $city = $$('.locate__city-current');
	const $detailsGroup = $('.details .data-group');
	const $nextDaysGroup = $('.next-days .data-group');
	const $changeLocate = $$('.locate__change');
	const $sidebarToggle = $('.sidebar-toggle');
	const $sidebar = $('.sidebar');
	const $scales = $('.scales');
	const $overlaps = $('.overlaps');
	const $loading = $('.loading');
	const $progress = $('.loading__progressBar-progress');

	let defaultCity = 'London';
	let weatherData;
	let lineArr;
	let chartData;

	class weather {
		constructor({ city, offsetTime, temp, state, des, details, nextDays }) {
			this.city = city;
			this.offsetTime = offsetTime;
			this.temp = temp;
			this.state = state;
			this.des = des;
			this.details = details;
			this.nextDays = nextDays
		}
		render() {
			const groupHTML = ({ title, data }) => {
				return `<div class="data-group__item">
							<span class="data-group__item-title">${title}</span>
							<span class="data-group__item-data">
								${data}
							</span>
						</div> `
			}
			const { city, offsetTime, temp, state, des, details, nextDays } = this;

			$currentTemp.setAttribute('data', temp);
			$titleWeather.innerText = state;

			$desWeather.innerText = des;
			$city.forEach(item => item.innerText = city);

			let detailHTML = '';
			for (let key in details) {
				const data = {
					title: key,
					data: details[key]
				};
				
				detailHTML += groupHTML(data);
			}
			$detailsGroup.innerHTML = detailHTML;

			const nextDaysHTML = nextDays.map(day => {
				const {weekday,temp} = day;
				const data = {
					title: weekday,
					data: temp + '<sup> o</sup>'
				};
				
				return groupHTML(data);
			}).join('');
			$nextDaysGroup.innerHTML = nextDaysHTML;
		};
	};

	function resetData() {
		weatherData = {};
		chartData = [];
		lineArr = [];
	};

	function handleData() {
		const defaultCityData = JSON.parse(window.localStorage.getItem('defaultCity'));
		if (defaultCityData) defaultCity = defaultCityData;

		window.addEventListener("beforeunload", function () {
			const defaultCityData = weatherData.city;
			if (defaultCityData) window.localStorage.setItem('defaultCity', JSON.stringify(defaultCityData));
		});
	}
	function getWeather({ city, latitude, longitude }) {
		loading();
		resetData();

		const apiKey = 'e3d73aaf2fef52922336328f78d08357';
		let apiData = `q=${city}`;

		if (latitude && longitude) apiData = `lat=${latitude}&lon=${longitude}`;

		function getCurrentWeather() {
			const url = `https://api.openweathermap.org/data/2.5/weather?${apiData}&appid=${apiKey}`;

			return fetch(url)
				.then(response => response.json())
				.then(data => {
					if(!data) return;

					offsetTime = data.timezone;
					weatherData = {
						city: data.name,
						offsetTime: data.timezone,
						temp: kelvinToCelsius(data.main.temp),
						state: data.weather[0].main,
						des: data.weather[0].description,
						details: {
							cloudy: data.clouds.all + ' %',
							humidity: data.main.humidity + ' %',
							wind: data.wind.speed + ' km/h',
						}
					}
				});
		};

		function getNextDaysWeather() {
			const url = `https://api.openweathermap.org/data/2.5/forecast?${apiData}&appid=${apiKey}`;

			return fetch(url)
				.then(response => response.json())
				.then(data => {
					if(!data) return;

					const currentDate = (new Date).getDate();
					weatherData.nextDays = [];
					data.list.map(date => {
						const time = new Date(date.dt_txt);
						const { weekday } = formatTime(time);//{ hours, minutes, amPm, weekday, date, month, year } 
						if (time.getDate() != currentDate && time.getHours() == 6) {
							const temp = kelvinToCelsius(date.main.temp);
							const nextDay = {
								weekday: weekday,
								temp: temp
							}

							weatherData.nextDays.push(nextDay);
						}

						if (time.getDate() == currentDate) {
							const { hours, amPm } = formatTime(time);
							const temp = kelvinToCelsius(date.main.temp);
							const hourWeatherTemp = {
								time: `${hours}:00${amPm}`,
								temp: temp
							}

							chartData.push(hourWeatherTemp);
						}
					})
				})
		};

		(async function getData() {
			await getCurrentWeather();
			await getNextDaysWeather();
			await lineChart();
			window.addEventListener("resize", lineChart);
			await updateTime();
			setInterval(updateTime, 60000);

			new weather(weatherData).render();
		})();
	};

	function updateTime() {
		const d = new Date();
		const utc = d.getTime() + (d.getTimezoneOffset() * 60000);
		const timeZone = utc + weatherData.offsetTime * 1000;
		const { hours, minutes, amPm, weekday, date, month, year } = formatTime(timeZone);
		$currentTime.innerText = `${hours} : ${minutes} ${amPm} - ${weekday}, ${date} ${month} ${year}`;
	};

	function formatTime(timeData) {
		let time = new Date(timeData);
		const [weekday, month, date, year] = time.toString().split(' ')//[weekday, month, date, year, hour, timeZone, region]

		let hours = time.getHours();
		const amPm = hours >= 12 ? 'PM' : 'AM';
		hours = hours > 12 ? hours - 12 : hours;
		const minutes = ('00' + time.getMinutes()).slice(-2);

		const result = {
			hours: hours,
			minutes: minutes,
			amPm: amPm,
			weekday: weekday,
			date: date,
			month: month,
			year: year
		}
		return result;
	};

	function kelvinToCelsius(temp) {
		return Math.floor(temp - 273.15);
	};

	function isCanvasBlank(canvas) {
		const context = canvas.getContext('2d');

		const pixelBuffer = new Uint32Array(
			context.getImageData(0, 0, canvas.width, canvas.height).data.buffer
		);

		return !pixelBuffer.some(color => color !== 0);
	}

	function lineChart() {
		const $container = $('#chart');
		const $chart = $('#chart canvas');
		const $tooltip = $('#chart .tooltip');
		const chart_ctx = $chart.getContext('2d');

		let chartWidth = chart_ctx.canvas.width;
		let chartHeight = chart_ctx.canvas.height;

		$scales.innerHTML = '';

		if (isCanvasBlank($chart)) chart_ctx.canvas.height = $container.offsetHeight;
		chart_ctx.canvas.width = $container.offsetWidth;

		chart_ctx.clearRect(0, 0, chartWidth, chartHeight);

		chartWidth = chart_ctx.canvas.width;
		chartHeight = chart_ctx.canvas.height;

		let columnWidth = chartWidth / chartData.length;

		const isHasManyColumn = chartData.length * 60 > chartWidth;
		const paddingRight = 30;
		if (isHasManyColumn) {
			columnWidth = 60;

			chart_ctx.canvas.width = chartData.length * columnWidth + paddingRight;

			$container.addEventListener('wheel', function (e) {
				e.preventDefault();

				const isScrollLeft = e.deltaY > 0;
				if (isScrollLeft) return $container.scrollLeft += 30;
				$container.scrollLeft -= 30;
			});
		}

		const paddingLeft = 40;
		const axisX = chartData.map((value, index) => paddingLeft + index * columnWidth);

		const mouse = {};
		$container.addEventListener('mousemove', function (event) {
			mouse.x = event.offsetX;
			mouse.y = event.offsetY;
		})

		// draw grid y
		axisX.map(x => {
			const y = chartHeight;

			chart_ctx.strokeStyle = '#676767';
			chart_ctx.lineWidth = 1;
			chart_ctx.moveTo(x, 0);
			chart_ctx.lineTo(x, y);
		})
		chart_ctx.stroke();

		axisX.map((x, i) => {
			const $scale = document.createElement('span');
			$scale.innerText = chartData[i].time;

			$scale.style.left = x + 'px';
			$scales.appendChild($scale);
		})
		const $scale = $scales.querySelectorAll('span');

		const tempsArr = chartData.map(data => data.temp);
		let addHeight = 0;
		const minTemp = Math.min(...tempsArr);
		if (minTemp < 0) addHeight = minTemp - 20;

		//draw chart line 
		class line {
			constructor({ index, x, y, value }) {
				this.index = index;
				this.x = x;
				this.y = y;
				this.value = value;
			}
			draw() {
				const { index, x, y, value } = this;

				chart_ctx.moveTo(0, $chart);
				chart_ctx.strokeStyle = '#fff';
				chart_ctx.lineWidth = 2;
				chart_ctx.lineTo(x, y);
				chart_ctx.stroke();

				$tooltip.style.left = x + 'px';
				$tooltip.style.top = y + 'px';
				$tooltip.setAttribute('data', value);
			}
			interact() {
				const { index, x, y, value } = this;

				const isHover = mouse.x > x - 15 && mouse.x < x + 15;
				if (!isHover) return;

				$tooltip.style.left = x + 'px';
				$tooltip.style.top = y + 'px';
				$tooltip.setAttribute('data', value);

				$scale.forEach(item => item.classList = '');
				$scale[index].classList = 'active';
			}
		}

		// line
		chart_ctx.beginPath();
		axisX.map((posX, i) => {
			if (!chartData[i]) return;
			const y = chartHeight - (chartData[i].temp + addHeight) * 4;
			const temp = chartData[i].temp;
			const data = {
				index: i,
				x: posX,
				y: y,
				value: temp
			}
			const newLine = new line(data);
			newLine.draw();
			lineArr.push(newLine);
		})

		function loop() {
			lineArr.map(line => line.interact());
			requestAnimationFrame(loop);
		}
		loop();
	};

	function loading() {
		const tl = gsap.timeline();
		tl.to($loading, { display: 'flex', opacity: 1, duration: 0.5 });
		tl.to($progress, { width: '100%', duration: 2.5 });
		tl.to($loading, { display: 'none', opacity: 0, duration: 0.5 });
		tl.to($progress, { width: '0%', duration: 0 });
	};

	function locationWeather() {
		function locateWeather(position) {
			const { latitude, longitude } = position.coords;

			const data = {
				latitude: latitude,
				longitude: longitude
			};
			getWeather(data);
		};
		function defaultWeather() {
			getWeather({ city: defaultCity });
		};

		navigator.geolocation.getCurrentPosition(locateWeather, defaultWeather);
	};

	function handleEvent() {
		$changeLocate.forEach(btn => {
			btn.onclick = function () {
				const city = this.parentElement.querySelector('.locate__city-current').innerText;
				getWeather({ city: city });
				$sidebar.classList.remove('expand');
			}
		})

		$sidebarToggle.onclick = function () {
			$sidebar.classList.toggle('expand');
		}

		$overlaps.onclick = function () {
			$sidebar.classList.remove('expand');
		}
	};

	(function start() {
		handleData();
		locationWeather();
		handleEvent();
	})();
})()



