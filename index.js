var fs = require('fs');
var url = require('url');
var path = require("path");
var async = require('async');
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

function listPagesFromHtml(html) {
    var $ = cheerio.load(html);
    return $('.main .page_select').first().find('select option')
        .map(function(i, e) {
            return {
                number: $(e).text(),
                url: $(e).val()
            };
        })
        .get();
}

function getImageUrl(html) {
    var $ = cheerio.load(html);
    return $('#viewer img').first().attr('src');
}

function downloadImageOnPage(downloadJob, page, cb) {
    request.get(page.url, function(error, response, html) {
        if (error) {
            return cb(error);
        }
        var imageUrl = getImageUrl(html),
            imageFileName = path.basename(
                url.parse(imageUrl).pathname
            ),
            outputFile = path.resolve(
                downloadJob.dest,
                page.number + path.extname(imageFileName)
            );
        request.get(imageUrl)
            .pipe(fs.createWriteStream(outputFile))
            .on("error", cb)
            .on("finish", cb);
    });
}

mangatown.downloadChapter = function(downloadJob, config, cb) {
    request.get(downloadJob.url, function(error, response, html) {
        if (error) {
            return cb(error);
        }
        var pages = listPagesFromHtml(html);
        async.eachLimit(pages, config.pageConcurrency, function(page, cb) {
            downloadImageOnPage(downloadJob, page, cb);
        }, cb);
    });
};

mangatown.seriesNameToUrl = function(job) {
    return 'http://www.mangatown.com/manga/' + job.series
        .toLowerCase()
        .replace(/\s/g, '_')
        .replace(/[^a-z0-9_]/, '');
};

module.exports = mangatown;
