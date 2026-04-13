require('dotenv').config();
const fs = require('fs');
const path = require('path');
const matter = require('gray-matter');

const API_KEY = process.env.GOOGLE_PLACES_API_KEY;
if (!API_KEY) {
    console.error("Missing GOOGLE_PLACES_API_KEY in .env");
    process.exit(1);
}

const QUERIES = [
    "restaurant in Sault Ste. Marie, Ontario",
    "cafe in Sault Ste. Marie, Ontario",
    "bar in Sault Ste. Marie, Ontario",
    "breakfast in Sault Ste. Marie, Ontario",
    "pizza in Sault Ste. Marie, Ontario",
    "sushi in Sault Ste. Marie, Ontario",
];

const EXCLUDED_TAGS = [
    "convenience_store",
    "gas_station",
    "grocery_store",
    "supermarket",
    "liquor_store",
    "discount_store",
    "department_store",
    "event_venue",
    "hotel",
    "clothing_store"
];

const RESTAURANTS_DIR = path.join(__dirname, '../src/restaurants');

function slugify(text) {
    return text.toString().toLowerCase()
        .replace(/\s+/g, '-')
        .replace(/[^\w\-]+/g, '')
        .replace(/\-\-+/g, '-')
        .replace(/^-+/, '')
        .replace(/-+$/, '');
}

async function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchPlaces() {
    const allPlaces = new Map();

    console.log("Searching for places to eat...");

    for (const query of QUERIES) {
        try {
        console.log(`Querying: "${query}"...`);
        let hasNextPage = true;
        let nextPageToken = null;

        while (hasNextPage) {
            let body = { textQuery: query };
            if (nextPageToken) {
                body.pageToken = nextPageToken;
            }

            const response = await fetch("https://places.googleapis.com/v1/places:searchText", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "X-Goog-Api-Key": API_KEY,
                    "X-Goog-FieldMask": "places.id,places.displayName,places.primaryType,places.editorialSummary,places.regularOpeningHours,places.formattedAddress,nextPageToken"
                },
                body: JSON.stringify(body)
            });

            const data = await response.json();
            
            if (data.error) {
                console.error("API error:", data.error.message);
                hasNextPage = false;
                continue;
            }

            if (data.places) {
                for (const place of data.places) {
                    allPlaces.set(place.id, place);
                }
            }

            if (data.nextPageToken) {
                await delay(2000);
                nextPageToken = data.nextPageToken;
            } else {
                hasNextPage = false;
            }
        }
        } catch (e) {
            console.error(`Error querying "${query}":`, e);
        }
    }

    console.log(`Found ${allPlaces.size} unique places. Filtering and formatting...`);

    let savedCount = 0;

    for (const [place_id, place] of allPlaces.entries()) {
        try {
            // Filter by country (Must contain ON or Ontario)
            const address = place.formattedAddress || "";
            if (!address.includes(" ON ") && !address.includes(", ON") && !address.includes("Ontario")) {
                console.log(`Skipping ${place.displayName?.text}: Not in Ontario -> ${address}`);
                continue;
            }

            // Filter out by tag
            if (place.primaryType && EXCLUDED_TAGS.includes(place.primaryType)) {
                console.log(`Skipping ${place.displayName?.text}: Excluded tag -> ${place.primaryType}`);
                continue;
            }

            let hours = null;
            if (place.regularOpeningHours && place.regularOpeningHours.weekdayDescriptions) {
                hours = {};
                place.regularOpeningHours.weekdayDescriptions.forEach(desc => {
                const parts = desc.split(': ');
                if (parts.length >= 2) {
                    hours[parts[0]] = parts.slice(1).join(': ');
                }
                });
            }

            const description = place.editorialSummary ? place.editorialSummary.text : "";
            
            const tags = [];
            if (place.primaryType) {
                tags.push(place.primaryType.replace(/_/g, ' '));
            }

            savePlaceMarkdown({
                id: place.id,
                name: place.displayName ? place.displayName.text : "Unknown",
                hours: hours,
                tags: tags,
                description: description,
                address: address
            });

            savedCount++;
        
        } catch(e) {
            console.error(`Error formatting place ${place_id}:`, e);
        }
    }

    console.log(`Successfully processed ${savedCount} places.`);
}

function savePlaceMarkdown(place) {
    const slug = slugify(place.name);
    const filePath = path.join(RESTAURANTS_DIR, `${slug}.md`);

    let frontmatter = {
        title: place.name,
        tags: place.tags,
        description: place.description,
        freeze: false,
        ignore: false,
        locations: [
            {
                address: place.address,
                google_place_id: place.id,
                hours: place.hours || null
            }
        ]
    };

    let content = "";

    if (fs.existsSync(filePath)) {
        const existingFile = fs.readFileSync(filePath, 'utf8');
        const parsed = matter(existingFile);

        if (parsed.data.ignore || parsed.data.freeze) {
            console.log(`Skipping ${place.name} (freeze or ignore is true)`);
            return;
        }

        frontmatter = {
            ...parsed.data, 
            title: parsed.data.title || place.name
        };

        if (!frontmatter.locations) {
            frontmatter.locations = [];
            if (frontmatter.address || frontmatter.google_place_id) {
                frontmatter.locations.push({
                    address: frontmatter.address,
                    google_place_id: frontmatter.google_place_id,
                    hours: frontmatter.hours || null
                });
            }
            delete frontmatter.address;
            delete frontmatter.google_place_id;
            delete frontmatter.hours;
        }

        const existingLocationIndex = frontmatter.locations.findIndex(
            loc => loc.google_place_id === place.id
        );

        const newLoc = {
            address: place.address,
            google_place_id: place.id,
            hours: place.hours || null
        };

        if (existingLocationIndex > -1) {
            frontmatter.locations[existingLocationIndex] = newLoc;
        } else {
            frontmatter.locations.push(newLoc);
        }

        if (!parsed.data.description && place.description) {
            frontmatter.description = place.description;
        }

        if (parsed.data.tags) {
            frontmatter.tags = parsed.data.tags;
        }

        content = parsed.content; 
    }

    const newFileContent = matter.stringify(content, frontmatter);
    fs.writeFileSync(filePath, newFileContent, 'utf8');
}

fetchPlaces().then(() => {
    console.log("Done fetching places.");
});
