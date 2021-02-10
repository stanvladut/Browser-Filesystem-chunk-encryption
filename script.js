var cipherTime0, cipherTime1, decipherTime0, decipherTime1,
    cryptoParams = {
        iv: window.crypto.getRandomValues(new Uint8Array(16)),
    };

if (window.crypto && !window.crypto.subtle && window.crypto.webkitSubtle) {
    window.crypto.subtle = window.crypto.webkitSubtle;
}

//  ========== UTILS
function ArrayBufferToString(buffer) {
    var result_string = "";
    var view = new Uint8Array(buffer);

    for(var i = 0; i < view.length; i++)
        result_string = result_string + String.fromCharCode(view[i]);

    return result_string;
}

function arrayBufferToBase64String(arrayBuffer) {
    var byteArray = new Uint8Array(arrayBuffer);
    var byteString = '';

    for (var i=0; i<byteArray.byteLength; i++) {
        byteString += String.fromCharCode(byteArray[i]);
    }

    return btoa(byteString);
};

function base64ToArrayBuffer(base64Str) {
    var raw = atob(base64Str);
    var arrayBuff = new Uint8Array(new ArrayBuffer(raw.length));
    for(var i = 0; i < raw.length; ++i) {
        arrayBuff[i] = raw.charCodeAt(i);
    }
    return arrayBuff;
};
// ========== UTILS


// =========== FILE PROCESSING
var processFile = function(file){
  var chunkSize = 5 * 1024 * 1024, //5 mb;
      offset = 0, //cursor in reading file
      chunks = Math.ceil(file.size/chunkSize,chunkSize), //number of chunks
      actualChunk = 0; //actual chunck

  // success callback for requesting access to filesystem
  function onInitFs(fs) {
    //encrypt the chunk
    var AESCBC_encrypt = function (file, params) {
      window.crypto.subtle.encrypt({
          name: "AES-CBC",
          iv: params.iv
      }, params.key, file)
      .then(function(encrypted){
        cipherTime1 = Date.now();

        fs.root.getFile('encrypted.txt', {create: true}, function(fileEntry) {
          // Create a FileWriter object for our FileEntry (log.txt).
          fileEntry.createWriter(function(fileWriter) {
            fileWriter.seek(fileWriter.length);

            fileWriter.onwriteend = function(e) {
              actualChunk++;
              processChunk();
            };

            fileWriter.onerror = function(e) {
              console.log('Write failed: ' + e.toString());
            };

            content = arrayBufferToBase64String(encrypted);
            //at the beginning of every chunk specify it's size
            var blob = new Blob(["nextChunkSize[" + content.length + "]" + content], {type: 'text/plain'});
            fileWriter.write(blob);
          });
        });

        //console.log(arrayBufferToBase64String(encrypted).length);
        $('.results_encryption span').text((cipherTime1-cipherTime0)/1000);
      })
      .catch();
    }

    // handler for successfully reading the chunk
    var readEventHandler = function(evt) {
      //display in console the progress
      //console.log(offset + '/' + file.size);

      if (offset >= file.size) {
        $('body').append('<div>Encryption done</div>');
        $('.decryption-button').attr('disabled', false);
        return;
      }

      if (evt.target.error == null) {
        offset += chunkSize;
        AESCBC_encrypt(evt.target.result, cryptoParams);
      } else {
        console.log("Read error: " + evt.target.error);
        return;
      }
    }

    //proccess next chunk
    var processChunk = function() {
      var reader = new FileReader(),
          chunk = file.slice(offset, offset + chunkSize);

      reader.onload = readEventHandler;
      reader.readAsArrayBuffer(chunk);
    }

    // now let's start the read with the first block
    cipherTime0 = Date.now(); //start timer for encryption time
    processChunk();
  }

  navigator.webkitPersistentStorage.requestQuota (
  6000 * 1024 * 1024, function(grantedBytes) {
      window.webkitRequestFileSystem(PERSISTENT, grantedBytes, onInitFs);

  }, function(e) { console.log('Error', e); });
}

var unprocessFile = function() {
  function onInitFs2(fs) {
    var nextChunk = 0,
        offset = 0;

    //continue only if the encrypted file is readable
    fs.root.getFile('encrypted.txt', {}, function(fileEntry) {
      // Get a File object representing the file,
      // then use FileReader to read its contents.
      fileEntry.file(function(file) {
        var eventHandler = function(evt) {
         if (offset >= file.size) {
           $('body').append('<div>Decryption done</div>');
           $('body').append('<a href="filesystem:https://192.168.5.35:8443/persistent/decrypted"> click to download </a>');
           return;
         }

         if (evt.target.error == null) {
           offset += nextChunk;

           //dimension of next chunk to read
           var separatorChunkSize = parseInt(evt.target.result.match(/nextChunkSize\[[\d]+\]/gi)[0].match(/\[[\d]+\]/gi)[0].match(/[\d]+/gi)[0]),
               separatorSize = evt.target.result.match(/nextChunkSize\[[\d]+\]/gi)[0].length;
           nextChunk = separatorSize + separatorChunkSize;

           //chunk to be read
           content = evt.target.result.substr(separatorSize, separatorSize + nextChunk);

           fs.root.getFile('decrypted', {create: true}, function(fileEntry) {
             // Create a FileWriter object for our FileEntry (log.txt).
             fileEntry.createWriter(function(fileWriter) {
               fileWriter.seek(fileWriter.length);

               fileWriter.onwriteend = function(e) {
                 //after appending decrypted chunk to decrypted file, process next chunk
                 processNext();
               };

               fileWriter.onerror = function(e) {
                 console.log('Write failed: ' + e.toString());
               };

              //decrypt the actual chunk
               window.crypto.subtle.decrypt({
                   name: "AES-CBC",
                   iv: cryptoParams.iv
               }, cryptoParams.key, base64ToArrayBuffer(content))
               .then(function(decrypted) {
                  decipherTime1 = Date.now();

                  var blob = new Blob([decrypted], {type: $('#file_to_test')[0].files[0].type, duration: $('#file_to_test')[0].files[0].duration});
                  fileWriter.write(blob);

                  $('.results_decryption span').text((decipherTime1-decipherTime0)/1000);
               })
               .catch(function(err){
                 console.log(err);
               });
             });
           });
         } else {
           console.log("Read error: " + evt.target.error);
           return;
         }
        };

        var processNext = function() {
          var reader = new FileReader(),
              chunk = file.slice(offset, offset + nextChunk);

          reader.readAsText(chunk);
          reader.onloadend = eventHandler;
        }

        var processFirst = function() {
          var reader = new FileReader(),
              chunk = file.slice(0, 30);

          reader.readAsText(chunk);
          reader.onloadend = function(evt) {
            if (evt.target.error == null) {
              //dimension of next chunk to read
              var separatorChunkSize = parseInt(evt.target.result.match(/nextChunkSize\[[\d]+\]/gi)[0].match(/\[[\d]+\]/gi)[0].match(/[\d]+/gi)[0]),
                  separatorSize = evt.target.result.match(/nextChunkSize\[[\d]+\]/gi)[0].length;

              nextChunk = separatorSize + separatorChunkSize;
              processNext();
            } else {
              console.log("Read error: " + evt.target.error);
              return;
            }
          };
        }

        // now let's start the read with the first block
        decipherTime0 = Date.now(); //start timer for decryption time
        processFirst();
      });
    });
  }

  navigator.webkitPersistentStorage.requestQuota (
    6000 * 1024 * 1024, function(grantedBytes) {

        window.webkitRequestFileSystem(PERSISTENT, grantedBytes, onInitFs2);

    }, function(e) { console.log('Error', e); }
  );
}
// ========== FILE PROCESSING

// ========= EVENTS
$('#file_to_test').change(function(){
  $('.file_size').text(($('#file_to_test')[0].files[0].size/(1024*1024)).toFixed(2) + 'MB');
});

$(".encryption-button").click(function(event) {
  // generate key for AES and then begin processing
  window.crypto.subtle.generateKey({
      name: "AES-CBC",
      length: 256,
  }, false, ["encrypt", "decrypt"])
  .then(function(key){
    cryptoParams.key = key;
    processFile($('#file_to_test')[0].files[0]);
  })
  .catch();
});

$(".decryption-button").click(function(event) {
  unprocessFile();
});

$('.delete_file').click(function(e){
  function onInitFs2(fs) {
    for (i=0;i<=5000;i++) {
      fs.root.getFile('encrypted.txt', {}, function(fileEntry) {
        fileEntry.remove(function() {
          console.log('File removed.');
        });
      });

      fs.root.getFile('decrypted', {}, function(fileEntry) {
        fileEntry.remove(function() {
          console.log('File removed.');
        });
      });
    }
  }

  navigator.webkitPersistentStorage.requestQuota (
    6000 * 1024 * 1024, function(grantedBytes) {
        window.webkitRequestFileSystem(PERSISTENT, grantedBytes, onInitFs2);
    }, function(e) { console.log('Error', e); }
  );
});
// ============ EVENTS
