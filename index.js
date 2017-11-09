var fs = require('fs');
var url = require('url');
var path = require('path');
var async = require('async');
var ranger = require('number-ranger');
var request = require('request');
var cheerio = require('cheerio');

var mangatown = {};

const addHttps = url => url.replace(/^\/\//, 'https://');

function listChaptersFromHtml(html, job) {
    var $ = cheerio.load(html);
    var title = $('h1.title-top').text();

    var chapters = $('.chapter_list li a')
        .map(function(i, e) {
            var chapter = parseFloat($(e).text().replace(title, ''));
            return {
                series: job.series,
                chapter: chapter,
                url: addHttps($(e).attr('href'))
            };
        })
        .get()
        .filter(ranger.isInRangeFilter(job.chapters, 'chapter'))
        .sort(function(a, b) {
            return parseFloat(a.chapter) - parseFloat(b.chapter);
        });

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

function checkPageFound($) {
    if ($('.no-info').length) {
        return {
            code: 'cancel',
            message: 'Could not find chapter'
        };
    }
    return false;
}

function listPagesFromHtml($) {
    return $('.main .page_select').first().find('select option')
        .map(function(i, e) {
            return {
                index: i,
                number: $(e).text(),
                url: addHttps($(e).val())
            };
        })
        .get();
}

function getImageUrl(html) {
    var $ = cheerio.load(html);
    return $('#image').attr('src');
}

function downloadImageOnPage(config, downloadJob, page, cb) {
    request.get(page.url, function(error, response, html) {
        if (error) {
            return cb(error);
        }
        var outputFile;
        var imageUrl = getImageUrl(html);
        var imageFileName = path.basename(url.parse(imageUrl).pathname);

        if (typeof config.filename === 'function') {
            outputFile = config.filename(config, downloadJob, page.index, path.extname(imageFileName));
        }
        else {
            outputFile = path.resolve(
                downloadJob.dest,
                page.number + path.extname(imageFileName)
            );
        }
        request.get(imageUrl)
            .pipe(fs.createWriteStream(outputFile))
            .on('error', cb)
            .on('finish', cb);
    });
}

mangatown.downloadChapter = function(downloadJob, config, cb) {
    request.get(downloadJob.url, function(error, response, html) {
        if (error) {
            return cb(error);
        }
        var $ = cheerio.load(html);
        var pageNotFound = checkPageFound($);
        if (pageNotFound) {
            return cb(null, pageNotFound);
        }

        var pages = listPagesFromHtml($);
        async.eachLimit(pages, config.pageConcurrency, function(page, cb) {
            downloadImageOnPage(config, downloadJob, page, cb);
        }, function(error) {
            if (error) {
                return cb(error);
            }
            return cb(null, {
                code: 'end'
            });
        });
    });
};

mangatown.seriesNameToUrl = function(job) {
    var series = job.series
        .toLowerCase()
        .replace(/[\s-:]/g, '_')    // Replace special characters and spaces by '_'
        .replace(/[^a-z0-9_]/g, '') // Remove characters that are not alphanumerical or _
        .replace(/__+/g, '_');      // Remove consecutive _
    return 'https://www.mangatown.com/manga/' + series + '/';
};

module.exports = mangatown;
