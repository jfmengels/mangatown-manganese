var fs = require('fs');
var async = require('async');
var sinon = require('sinon');
var expect = require('chai').expect;
var stream = require('stream');

var mangatown = require('../');
var request = require('request');

describe('seriesNameToUrl', function() {
    it('should end with a "/"', function() {
        expect(mangatown.seriesNameToUrl({
            series: 'Wakusei No Samidare'
        })).to.equal('https://www.mangatown.com/manga/wakusei_no_samidare/');
    });

    it('should make series name lower case', function() {
        expect(mangatown.seriesNameToUrl({
            series: 'Wakusei No Samidare'
        })).to.equal('https://www.mangatown.com/manga/wakusei_no_samidare/');
    });

    it('should replace spaces by underscores', function() {
        expect(mangatown.seriesNameToUrl({
            series: 'One Piece'
        })).to.equal('https://www.mangatown.com/manga/one_piece/');
    });

    it('should replace - by underscores', function() {
        expect(mangatown.seriesNameToUrl({
            series: 'Sun-Ken Rock'
        })).to.equal('https://www.mangatown.com/manga/sun_ken_rock/');
    });

    it('should replace ":" by underscores', function() {
        expect(mangatown.seriesNameToUrl({
            series: 'Re:Monster'
        })).to.equal('https://www.mangatown.com/manga/re_monster/');
    });

    it('should remove non-alphanumerical characters', function() {
        expect(mangatown.seriesNameToUrl({
            series: 'The Breaker: New Waves'
        })).to.equal('https://www.mangatown.com/manga/the_breaker_new_waves/');
    });

    it('should not have more than one consecutive underscore', function() {
        expect(mangatown.seriesNameToUrl({
            series: 'Area D - Inou Ryouiki'
        })).to.equal('https://www.mangatown.com/manga/area_d_inou_ryouiki/');

        expect(mangatown.seriesNameToUrl({
            series: 'Area D - + - Inou Ryouiki'
        })).to.equal('https://www.mangatown.com/manga/area_d_inou_ryouiki/');
    });
});

describe('listJobs', function() {
    before(function(done) {
        fs.readFile('./test/fixtures/wakusei_no_samidare.html', function(error, html) {
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
            series: 'Wakusei No Samidare',
            chapters: [{
                start: 0,
                end: 5
            }, {
                start: 63,
                end: 70
            }]
        };
        mangatown.listJobs(job, {}, function(error, downloadJobs) {
            expect(error).to.not.exist;
            expect(downloadJobs).to.have.length(10);
            var chapters = downloadJobs
                .map(function(j) {
                    expect(j).to.have.property('series', 'Wakusei No Samidare');
                    expect(j).to.have.property('chapter');
                    expect(j).to.have.property('url');
                    expect(j.url).to.match(/^https\:\/\/www\.mangatown\.com\/manga\/wakusei_no_samidare\/v\d+\/c\d+/);
                    return j.chapter;
                });

            expect(chapters).to.deep.equal([0, 1, 2, 3, 4, 5, 63, 64, 64.5, 65]);
            done();
        });
    });

    it('should callback with empty array when no chapters in page', function(done) {
        var job = {
            series: 'Wakusei No Samidare',
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
    var pages, page404, config, job, pageStubs;

    before(function(done) {
        async.map([
            './test/fixtures/wakusei_no_samidare_005_page1.html',
            './test/fixtures/wakusei_no_samidare_005_page2.html',
            './test/fixtures/404.html'
        ], function loadPage(file, cb) {
            fs.readFile(file, cb);
        }, function(error, results) {
            if (error) {
                return done(error);
            }
            pages = results;
            page404 = pages[2];
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
            series: 'Wakusei No Samidare',
            chapter: 5,
            url: 'https://www.mangatown.com/manga/wakusei_no_samidare/v01/c005/',
            dest: '/tmp/my/folder/Wakusei No Samidare/Wakusei No Samidare 5'
        };

        pageStubs = [
            requestStub
            .withArgs('https://www.mangatown.com/manga/wakusei_no_samidare/v01/c005/', sinon.match.func)
            .yields(null, null, pages[0]),

            requestStub
            .withArgs('https://www.mangatown.com/manga/wakusei_no_samidare/v01/c005/2.html', sinon.match.func)
            .yields(null, null, pages[1])
        ];

        var passThrough = new stream.PassThrough();
        createWriteStreamStub.returns(passThrough);

        var readableStreamMock = new stream.Readable();
        readableStreamMock._read = function noop() {};
        readableStreamMock.push('some_data');
        readableStreamMock.push(null);

        imageStub = requestStub
            .withArgs(sinon.match(/^https\:\/\/mangatown\.secure\.footprint\.net\//))
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
            expect(args[3]).to.equal('.jpg');

            expect(createWriteStreamStub.callCount).to.equal(2);
            expect(createWriteStreamStub.getCall(0).args[0]).to.equal('/some/root/folder/' + job.dest + '/1.jpg');
            expect(createWriteStreamStub.getCall(1).args[0]).to.equal('/some/root/folder/' + job.dest + '/2.jpg');
            done();
        });
    });

    it('should name the file using the external file name if config.filename is absent', function(done) {
        mangatown.downloadChapter(job, config, function(error) {
            expect(error).to.not.exist;
            expect(createWriteStreamStub.callCount).to.equal(2);
            expect(createWriteStreamStub.getCall(0).args).to.have.length(1);
            expect(createWriteStreamStub.getCall(0).args[0]).to.equal(job.dest + '/01.jpg');
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
            expect(createWriteStreamStub.getCall(0).args[0]).to.equal(job.dest + '/01.jpg');
            expect(createWriteStreamStub.getCall(1).args).to.have.length(1);
            expect(createWriteStreamStub.getCall(1).args[0]).to.equal(job.dest + '/02.jpg');
            done();
        });
    });

    it('should callback with end code', function(done) {
        mangatown.downloadChapter(job, config, function(error, result) {
            expect(error).to.not.exist;
            expect(result.code).to.equal('end');
            done();
        });
    });

    it('should callback with cancel code when finding a chapter not found page', function(done) {
        request.get.restore();
        requestStub = sinon.stub(request, 'get');
        requestStub.yields(null, null, page404);

        mangatown.downloadChapter(job, config, function(error, result) {
            expect(error).to.not.exist;
            expect(result.code).to.equal('cancel');
            expect(result.message).to.equal('Could not find chapter');
            done();
        });
    });
});
