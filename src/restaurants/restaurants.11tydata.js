module.exports = {
    layout: "restaurant.njk",
    eleventyComputed: {
        name: (data) => data.title,
        permalink: (data) => data.ignore ? false : data.permalink
    }
};