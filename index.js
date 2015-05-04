var ranger = require('number-ranger');
var request = require('request');
var cheerio = require('cheerio');

var mangatown = {};

function listChaptersFromHtml(html, job) {
    var $ = cheerio.load(html);
    var title = $('h1.title-top').text();

    var chapters = $('.chapter_list li a')
        .map(function(i, e) {
            var chapter = parseFloat($(e).text().replace(title, ''));
            return {
                series: job.series,
                chapter: chapter,
                url: $(e).attr('href')
            };
        })
        .get()
        .filter(ranger.isInRangeFilter(job.chapters, 'chapter'));

    return chapters;
}

mangatown.listJobs = function(job, config, cb) {
    var url = mangatown.seriesNameToUrl(job);
    request.get(url, function(error, response, html) {
        if (error) {
            return cb(error);
        }
        return cb(null, listChaptersFromHtml(html, job));
    });
};

mangatown.download = function(downloadJob, config, cb) {

};

mangatown.seriesNameToUrl = function(job) {
    return 'http://mangatown.com/manga/' + job.series
        .toLowerCase()
        .replace(/\s/g, '_')
        .replace(/[^a-z0-9_]/, '');
};

module.exports = mangatown;
