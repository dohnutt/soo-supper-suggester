module.exports = {
    layout: "restaurant.njk",
    eleventyComputed: {
        permalink: (data) => data.ignore ? false : data.permalink
    }
};