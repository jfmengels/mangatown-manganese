var fs = require('fs');
var async = require('async');
var sinon = require('sinon');
var expect = require('chai').expect;
var stream = require('stream');

var mangatown = require('../');
var request = require('request');

describe('seriesNameToUrl', function() {
    it('should make lower case', function() {
        expect(mangatown.seriesNameToUrl({
            series: 'Naruto'
        })).to.equal('http://www.mangatown.com/manga/naruto');
    });

    it('should replace spaces by underscores', function() {
        expect(mangatown.seriesNameToUrl({
            series: 'One Piece'
        })).to.equal('http://www.mangatown.com/manga/one_piece');
    });

    it('should replace - by underscores', function() {
        expect(mangatown.seriesNameToUrl({
            series: 'Sun-Ken Rock'
        })).to.equal('http://www.mangatown.com/manga/sun_ken_rock');
    });

    it('should replace ":" by underscores', function() {
        expect(mangatown.seriesNameToUrl({
            series: 'Re:Monster'
        })).to.equal('http://www.mangatown.com/manga/re_monster');
    });

    it('should remove non-alphanumerical characters', function() {
        expect(mangatown.seriesNameToUrl({
            series: 'The Breaker: New Waves'
        })).to.equal('http://www.mangatown.com/manga/the_breaker_new_waves');
    });

    it('should not have more than one consecutive underscore', function() {
        expect(mangatown.seriesNameToUrl({
            series: 'Area D - Inou Ryouiki'
        })).to.equal('http://www.mangatown.com/manga/area_d_inou_ryouiki');

        expect(mangatown.seriesNameToUrl({
            series: 'Area D - + - Inou Ryouiki'
        })).to.equal('http://www.mangatown.com/manga/area_d_inou_ryouiki');
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

describe('downloadChapter', function() {
    var requestStub, createWriteStreamStub, imageStub;
    var pages, config, job, pageStubs;

    before(function(done) {
        async.map([
            './test/fixtures/naruto_chapter662_page1.html',
            './test/fixtures/naruto_chapter662_page2.html'
        ], function loadPage(file, cb) {
            fs.readFile(file, cb);
        }, function(error, results) {
            if (error) {
                return done(error);
            }
            pages = results;
            done();
        });
    });

    beforeEach(function() {
        requestStub = sinon.stub(request, 'get');
        createWriteStreamStub = sinon.stub(fs, 'createWriteStream');

        config = {
            concurrency: 5,
            pageConcurrency: 5
        };
        job = {
            series: 'Naruto',
            chapter: 662,
            url: 'http://www.mangatown.com/manga/naruto/v63/c662/',
            dest: '/tmp/my/folder/Naruto/Naruto 662'
        };

        pageStubs = [
            requestStub
            .withArgs('http://www.mangatown.com/manga/naruto/v63/c662/', sinon.match.func)
            .yields(null, null, pages[0]),

            requestStub
            .withArgs('http://www.mangatown.com/manga/naruto/v63/c662/2.html', sinon.match.func)
            .yields(null, null, pages[1])
        ];

        var passThrough = new stream.PassThrough();
        createWriteStreamStub.returns(passThrough);

        var readableStreamMock = new stream.Readable();
        readableStreamMock._read = function noop() {};
        readableStreamMock.push('some_data');
        readableStreamMock.push(null);

        imageStub = requestStub
            .withArgs(sinon.match(/http\:\/\/cdn\./))
            .returns(readableStreamMock);

    });

    afterEach(function() {
        request.get.restore();
        fs.createWriteStream.restore();
    });

    it('should request chapter page 1, then request every page and download every image on each page', function(done) {
        mangatown.downloadChapter(job, config, function(error) {
            expect(error).to.not.exist;
            expect(pageStubs[0].callCount).to.be.at.most(2);
            expect(pageStubs[1].callCount).equal(1);
            expect(imageStub.callCount).to.equal(2);
            expect(createWriteStreamStub.callCount).to.equal(2);
            done();
        });
    });

    it('should name the file using the result of the config.filename function if available', function(done) {
        config.filename = sinon.spy(function(config, job, index, extension) {
            return '/some/root/folder/' + job.dest + '/' + (index + 1) + extension;
        });

        mangatown.downloadChapter(job, config, function(error) {
            var args;
            expect(error).to.not.exist;

            expect(config.filename.callCount).to.equal(2);
            args = config.filename.getCall(0).args;
            expect(args[0]).to.equal(config);
            expect(args[1]).to.equal(job);
            expect(args[2]).to.equal(0);
            expect(args[3]).to.equal('.png');

            expect(createWriteStreamStub.callCount).to.equal(2);
            expect(createWriteStreamStub.getCall(0).args[0]).to.equal('/some/root/folder/' + job.dest + '/1.png');
            expect(createWriteStreamStub.getCall(1).args[0]).to.equal('/some/root/folder/' + job.dest + '/2.jpg');
            done();
        });
    });

    it('should name the file using the external file name if config.filename is absent', function(done) {
        mangatown.downloadChapter(job, config, function(error) {
            expect(error).to.not.exist;
            expect(createWriteStreamStub.callCount).to.equal(2);
            expect(createWriteStreamStub.getCall(0).args).to.have.length(1);
            expect(createWriteStreamStub.getCall(0).args[0]).to.equal(job.dest + '/01.png');
            expect(createWriteStreamStub.getCall(1).args).to.have.length(1);
            expect(createWriteStreamStub.getCall(1).args[0]).to.equal(job.dest + '/02.jpg');
            done();
        });
    });

    it('should name the file using the external file name if config.filename is not a function', function(done) {
        config.filename = 'not a function';
        mangatown.downloadChapter(job, config, function(error) {
            expect(error).to.not.exist;
            expect(createWriteStreamStub.callCount).to.equal(2);
            expect(createWriteStreamStub.getCall(0).args).to.have.length(1);
            expect(createWriteStreamStub.getCall(0).args[0]).to.equal(job.dest + '/01.png');
            expect(createWriteStreamStub.getCall(1).args).to.have.length(1);
            expect(createWriteStreamStub.getCall(1).args[0]).to.equal(job.dest + '/02.jpg');
            done();
        });
    });
});
