var fs = require('fs');
var request = require('request');
var url = require('url');
var cheerio = require('cheerio');

var outputDirectory = 'scraped';

var getFileNameFromUrl = function (source) {
    var path = source.pathname;
    var index = path.lastIndexOf('/');
    if (index < 0) {
        throw 'No file specified in URL: ' + source.href;
    }

    return path.substr(index + 1);
};

var getExtensionFromFileName = function (fileName) {
    var index = fileName.lastIndexOf('.');
    if (index >= 0) {
        return fileName.substr(index + 1);
    }
    return '';
};

var getAbsoluteUrlFromHref = function (base, href) {
    var rawDestination = url.parse(url.resolve(base, href));
    return url.parse(rawDestination.protocol + '//' + rawDestination.host + rawDestination.pathname);
};

var links = [
    { element: 'a', attribute: 'href' },
    { element: 'img', attribute: 'src' },
];

var scrapeRecursive = function (base, source, alreadyScraped, maxDepth) {
    // Ensure this item hasn't already been scraped
    if (maxDepth >= 0 && !alreadyScraped[source.href] && base.host == source.host) {
        alreadyScraped[source.href] = true;

        try {
            var fileName = getFileNameFromUrl(source);
            var path = outputDirectory + '/' + fileName;

            // Common result handler
            var handleBuffer = function (body) {
                fs.writeFile(path, body, function (err) {
                    if (!err) {
                        var extension = getExtensionFromFileName(fileName);
                        if (extension == 'htm' || extension == 'html') {
                            // Follow links
                            var $ = cheerio.load(body.toString());
                            for (var i = 0, count = links.length; i < count; i++) {
                                $(links[i].element).each(function (index, element) {
                                    var tag = $(element);
                                    var href = tag.attr(links[i].attribute);
                                    if (href) {
                                        // Recurse and scrape this item
                                        scrapeRecursive(base, getAbsoluteUrlFromHref(base, href), alreadyScraped, maxDepth - 1);
                                    }
                                });
                            }
                        }
                    } else {
                        console.log('Error writing file: ' + fileName);
                    }
                });
            };

            // Check if the file has already been downloaded
            fs.exists(path, function (exists) {
                if (exists) {
                    // Already downloaded; read it
                    console.log('Already downloaded: ' + source.href);
                    fs.readFile(fileName, function (err, buffer) {
                        if (!err) {
                            handleBuffer(buffer);
                        } else {
                            console.log('Error reading: ' + err);
                        }
                    });
                } else {
                    // Not yet downloaded; download it
                    console.log('Downloading:' + source.href);
                    request(
                        {
                            url: source.href,
                            encoding: null, // Return a Buffer so we can write raw data (e.g. for images)
                        },

                        function (err, response, buffer) {
                            if (!err && response.statusCode == 200) {
                                handleBuffer(buffer);
                            } else {
                                console.log('Error downloading (' + response.statusCode + '): ' + err);
                            }
                        }
                    );
                }
            });
        }
        catch (err) {
            console.log('Exception while processing item: ' + err);
        }
    }
};

if (process.argv.length != 3) {
    console.log('USAGE: ' + process.argv[0] + ' ' + process.argv[1] + ' <URL>');
} else {
    fs.mkdir(outputDirectory, function (err) {
        if (!err || err.code == 'EEXIST') {
            var source = url.parse(process.argv[2]);
            console.log('Scraping ' + source.href + '...');
            scrapeRecursive(source, source, {}, 20);
        } else {
            console.log('Failed to create directory: ' + err);
        }
    });
}

