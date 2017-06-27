const functions = require('firebase-functions');
const gcs = require('@google-cloud/storage')();
const yauzl = require('yauzl');
const fs = require('fs');
const path = require('path');
const os = require('os');

// // Create and Deploy Your First Cloud Functions
// // https://firebase.google.com/docs/functions/write-firebase-functions
//
// exports.helloWorld = functions.https.onRequest((request, response) => {
//  response.send("Hello from Firebase!");
// });

exports.unpack = functions.storage.object().onChange(event => {
    const object = event.data;
    const bucket = gcs.bucket(object.bucket);
    const filePath = object.name;

    //create random filename with same extension as uploaded file
    const tempLocalFile = path.join(os.tmpdir(), object.name.split('/').pop());

    if (object.contentType !== 'application/x-zip-compressed') {
        reject(Error("Not a zip file"));
        return;
    }

    // Exit if this is a move or deletion event.
    if (object.resourceState === 'not_exists') {
        reject(Error("File does not exist any more"));
        return;
    }

    // Exit if file exists but is not new and is only being triggered
    // because of a metadata change.
    if (object.resourceState === 'exists' && object.metageneration > 1) {
        reject(Error("This is a metadata change"));
        return;
    }

    if (object.name.startsWith('/unpackedMods/')) {
        reject(Error("This file was already unpacked."));
        return;
    }

    function parseZip(tempLocalFile) { return new Promise((resolve, reject) => {
        const unpackPath = `/unpackedMods/${object.name.split('/').pop()}/`;
        let numberOfFiles = 0;

        yauzl.open(tempLocalFile, (err, zipFile) => {
            if (err) {
                rejectAndLog(err);
                return;
            }
            zipFile.on('entry', entry => processEntry(zipFile, bucket, unpackPath, entry))
                .once('error', rejectAndLog)
                .once('close', () => {
                    console.log(`Unpacked ${numberOfFiles} files`);
                    resolve();
                });
        });

        function rejectAndLog(err) {
            console.error(err);
            reject(err);
        }

        function processEntry(zipFile, bucket, unpackPath, entry) {
            if (entry.fileName.endsWith('/')) {
                return;
            }

            zipFile.openReadStream(entry, (err, readStream) => {
                if (err) {
                    rejectAndLog(err);
                    return;
                }

                let destinationFileName = unpackPath + entry.fileName;
                readStream.pipe(bucket.file(destinationFileName).createWriteStream())
                    .on('error', rejectAndLog(err));
                numberOfFiles++;
            });
        }
    })}

    bucket.file(filePath).download({
        destination: tempLocalFile
    })
    .then(() => {
        console.log('Download complete');
        console.log(JSON.stringify(fs.statSync(tempLocalFile)));
    })
    .then(parseZip(tempLocalFile))
    .then(() => {
        //cleanup temp directory after metadata is extracted
        //Remove the file from temp directory
        return fs.unlink(tempLocalFile,() => {
            console.log("cleanup successful!");
        });
    })
    .catch((err) => {
        console.error('caught promise error', err);
    });
});