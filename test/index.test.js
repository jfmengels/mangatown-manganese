var fs = require('fs');
var sinon = require('sinon');
var expect = require('chai').expect;

var mangatown = require('../');
var request = require('request');

describe('seriesNameToUrl', function() {
    it('should make lower case', function() {
        expect(mangatown.seriesNameToUrl({
            series: 'Naruto'
        })).to.equal('http://mangatown.com/manga/naruto');
    });

    it('should replace spaces by underscores', function() {
        expect(mangatown.seriesNameToUrl({
            series: 'One Piece'
        })).to.equal('http://mangatown.com/manga/one_piece');
    });

    it('should remove non-alphanumerical characters', function() {
        expect(mangatown.seriesNameToUrl({
            series: 'The Breaker: New Waves'
        })).to.equal('http://mangatown.com/manga/the_breaker_new_waves');
    });
});

describe('listJobs', function() {
    before(function(done) {
        fs.readFile('./test/fixtures/naruto_0-100.html', function(error, html) {
            if (error) {
                return done(error);
            }
            sinon.stub(request, 'get')
                .yields(null, null, html);
            done();
        });
    });

    after(function() {
        request.get.restore();
    });

    it('should callback with array of jobs of available and in range chapters', function(done) {
        var job = {
            series: 'Naruto',
            chapters: [{
                start: 0,
                end: 5
            }, {
                start: 98,
                end: 103
            }]
        };
        mangatown.listJobs(job, {}, function(error, downloadJobs) {
            expect(error).to.not.exist;
            expect(downloadJobs).to.have.length(9);
            var chapters = downloadJobs
                .map(function(j) {
                    expect(j).to.have.property('series', 'Naruto');
                    expect(j).to.have.property('chapter');
                    expect(j).to.have.property('url');
                    expect(j.url).to.match(/http\:\/\/www\.mangatown\.com\/manga\/naruto\/v\d+\/c\d+/);
                    return j.chapter;
                })
                .sort(function(a, b) {
                    return a - b;
                });

            expect(chapters).to.deep.equal([0, 1, 2, 3, 4, 5, 98, 99, 100]);
            done();
        });
    });

    it('should callback with empty array when no chapters in page', function(done) {
        var job = {
            series: 'Naruto',
            chapters: [{
                start: 500,
                end: +Infinity
            }]
        };
        mangatown.listJobs(job, {}, function(error, downloadJobs) {
            expect(error).to.not.exist;
            expect(downloadJobs).to.have.length(0);
            done();
        });
    });
});


describe('download', function() {
    it('should have some tests written for it', function() {
        expect(false).to.be.true;
    });
});
