function parseTimeStringToMinutes(timeStr) {
    const match = timeStr.match(/(\d+)(?::(\d+))?\s*(AM|PM|am|pm)?/);
    if (!match) {
        return null;
    }

    let h = parseInt(match[1], 10);
    const m = parseInt(match[2] || 0, 10);
    const meridian = match[3] ? match[3].toUpperCase() : null;

    if (meridian === 'PM' && h < 12) h += 12;
    if (meridian === 'AM' && h === 12) h = 0;

    return h * 60 + m;
}

function isOpenNow(hours) {
    if (!hours || Object.keys(hours).length === 0) {
        return null;
    }

    const now = new Date();
    const currentMins = now.getHours() * 60 + now.getMinutes();

    const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    const todayName = days[now.getDay()];
    const yesterdayName = days[(now.getDay() + 6) % 7];

    function checkDay(dayName, offsetMins) {
        const str = hours[dayName];
        if (!str || str.toLowerCase().includes("closed")) {
            return false;
        }

        if (str.toLowerCase().includes("open 24 hours")) {
            return true;
        }

        const blocks = str.split(',');
        for (const block of blocks) {
            const parts = block.split(/[-–—]/);
            if (parts.length !== 2) {
                continue;
            }
            
            const openMin = parseTimeStringToMinutes(parts[0].trim());
            let closeMin = parseTimeStringToMinutes(parts[1].trim());

            if (openMin === null || closeMin === null) {
                continue;
            }
            
            if (closeMin <= openMin) {
                closeMin += 1440; // overnight wrap
            }
            
            const adjustedCurrent = currentMins + offsetMins;
            if (adjustedCurrent >= openMin && adjustedCurrent < closeMin) {
                return true;
            }
        }

        return false;
    }

    // Check if we are in yesterday's late night hours (offset current time by +1440 mins relative to yesterday)
    if (checkDay(yesterdayName, 1440)) {
        return true;
    }

    // Check today's normal hours
    return checkDay(todayName, 0);
}

function pickRandomRestaurant(restaurants) {
    if (restaurants.length === 0) {
        return null;
    }
    
    const openPlaces = [];
    const maybeOpenPlaces = [];
    restaurants.forEach(r => {
        let isOverallOpen = null;

        if (r.locations && r.locations.length > 0) {
            let anyOpen = false;
            let anyMaybe = false;
            
            for (const loc of r.locations) {
                const status = isOpenNow(loc.hours);
                if (status === true) {
                    anyOpen = true;
                } else if (status === null) {
                    anyMaybe = true;
                }
            }

            if (anyOpen) isOverallOpen = true;
            else if (anyMaybe) isOverallOpen = null;
            else isOverallOpen = false;
        } else {
            isOverallOpen = isOpenNow(r.hours);
        }

        if (isOverallOpen === true) {
            openPlaces.push(r);
        } else if (isOverallOpen === null) {
            maybeOpenPlaces.push(r);
        }
    });

    let pool = [];

    // open places go in the pool 3 times, but maybe-open only go in once.
    if (openPlaces.length > 0) {
        for (let i = 0; i < 3; i++) {
            pool = pool.concat(openPlaces);
        }
    }

    pool = pool.concat(maybeOpenPlaces);
    if (pool.length === 0) {
        // Fallback if everything is closed somehow
        pool = restaurants;
    }

    const roll = Math.floor(Math.random() * pool.length);
    return pool[roll];
}

let cachedRestaurants = null;

async function roll() {
    const btn = document.getElementById('roll');
    const originalText = btn.textContent || 'Roll it';
    const msg = document.getElementById('status-message');

    try {
        if (!cachedRestaurants) {
            const res = await fetch('/restaurants.json');
            cachedRestaurants = await res.json();
        }

        if (!cachedRestaurants || cachedRestaurants.length === 0) {
            if (msg) {
                msg.textContent = "No restaurants found! Try again later.";
                msg.style.color = "red";
            }
            btn.textContent = originalText;
            return;
        }

        let attempts = 0;
        let picked = null;
        
        while (attempts < 10) {
            picked = pickRandomRestaurant(cachedRestaurants);
            if (picked.url !== window.location.pathname) {
                break;
            }
            attempts++;
        }

        if (picked) {
            window.location.href = picked.url;
        } else {
            if (btn) btn.textContent = originalText;
        }
    } catch (e) {
        alert("Error loading restaurants. Try again later.");
        console.error(e);
        if (btn) btn.textContent = originalText;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const btn = document.getElementById('roll');
    const msg = document.getElementById('status-message');

    if (btn) {
        btn.onclick = (e) => {
            e.preventDefault();
            roll();
        };
    }

    if (!cachedRestaurants) {
        fetch('/restaurants.json')
            .then(res => res.json())
            .then(data => { cachedRestaurants = data; })
            .catch(err => console.error("Prefetch failed", err));
    }

    if (msg) {
        msg.textContent = "";
    }
});