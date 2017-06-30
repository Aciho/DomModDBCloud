const functions = require('firebase-functions');
const gcs = require('@google-cloud/storage')();
const JSZip = require("jszip");
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

    if (object.contentType !== 'application/x-zip-compressed') {
        // reject(Error("Not a zip file"));
        return;
    }

    // Exit if this is a move or deletion event.
    if (object.resourceState === 'not_exists') {
        // reject(Error("File does not exist any more"));
        return;
    }

    // Exit if file exists but is not new and is only being triggered
    // because of a metadata change.
    if (object.resourceState === 'exists' && object.metageneration > 1) {
        // reject(Error("This is a metadata change"));
        return;
    }

    if (object.name.startsWith('/unpackedMods/')) {
        // reject(Error("This file was already unpacked."));
        return;
    }

    console.log('Download start', filePath);
    let count = 0;
    return bucket.file(filePath).download()
    .then((data) => {
        var contents = data[0];
        console.log('Download complete', contents);
        return contents;
    })
    .then((contents) => { return JSZip.loadAsync(contents); })
    .then((zip) => {
        console.log('zip parsed', zip);
        const unpackPath = '/unpackedMods/' + object.name.split('/').pop() + '/';
        let sequence = Promise.resolve();
        zip.file(/.*/).forEach((zipEntry) => {
            if (!zipEntry.dir) {
                sequence = sequence.then(function() {
                    console.log(zipEntry.name);
                    return zip.generateInternalStream({type:"nodebuffer"}).accumulate();
                })
                .then((zipData) => {
                    let file = bucket.file(unpackPath + zipEntry.name);
                    file.save(zipData);
                    count++;
                    console.log(count);
                });
            }
        });
        return sequence;
    })
    .then(()=> {
        console.log(`Upload complete, ${count} files uploaded`);
    })
    .catch((err) => {
        console.error('caught promise error', err);
    });
});