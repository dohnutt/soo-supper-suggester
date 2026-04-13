module.exports = function(eleventyConfig) {

    eleventyConfig.addCollection("restaurants", (api) => {
        return api.getFilteredByGlob("src/restaurants/*.md")
            .filter(r => !r.data.ignore);
    });

    eleventyConfig.addPassthroughCopy("src/script.js");
    eleventyConfig.addPassthroughCopy("src/style.css");

    return {
        dir: {
            input: "src",
            output: "_site",
            includes: "_includes",
            data: "_data"
        },
        templateFormats: ["njk", "md", "html"]
    };
};
