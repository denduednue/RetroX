// 12000 queries per minute.
// 200 queries per second.

// Profile
// Games
// --> Playing a game. /play.html?game=encodeURIComponent({Google Drive File ID})

class GoogleDriveAPI {
  #accessToken;
  #controller;
  #xhr;
  #folders;

  constructor() {
    this.#controller = new AbortController();
    this.#xhr = new XMLHttpRequest();
  }

  async #init() {
    // Get new access key token
    await this.getToken()

    // Get folder IDs
    const query = "name != 'RetroX' and mimeType = 'application/vnd.google-apps.folder' and trashed = false"
    this.#folders = (await googleDriveAPI.listFiles(query)).files.reduce((acc, obj) => ({ ...acc, [obj.name]: obj.id }), {});

    // Init Skeleton Folders
    if (Object.keys(this.#folders).length == 0) {
      let retrox_id = await this.createFolder('RetroX');
      let games_id = await this.createFolder('Games', retrox_id);
      let images_id = await this.createFolder('Images', retrox_id);
      let saves_id = await this.createFolder('Saves', retrox_id);
      let states_id = await this.createFolder('States', retrox_id);

      this.#folders = {
        "Games": games_id,
        "Images": images_id,
        "Saves": saves_id,
        "States": states_id
      }
    }
  }

  // Get images
  async getImages(name, nextPageToken) {
    if (!this.#accessToken) await this.#init()
    const query = `mimeType != 'application/vnd.google-apps.folder' and '${this.#folders['Images']}' in parents and trashed = false${name ? ` and name contains '${name}'` : ''}`
    return await this.listFiles(query, 16, nextPageToken)
  }
  // Get game disks
  async getDisks(name) {
    if (!this.#accessToken) await this.#init()
    const query = `mimeType != 'application/vnd.google-apps.folder' and '${this.#folders['Games']}' in parents and trashed = false and appProperties has { key='name' and value='${name}' }`
    return await this.listFiles(query)
  }

  // Start Google authentication process
  auth(clientID = localStorage.getItem('google_client_id')) {
    var form = document.createElement('form');
    form.setAttribute('method', 'GET');
    form.setAttribute('action', 'https://accounts.google.com/o/oauth2/v2/auth');
    if (window.location.pathname.startsWith('/play')) form.setAttribute('target', '_blank');

    var params = {
      'client_id': clientID,
      'redirect_uri': 'http://localhost:5500/callback.html', // 'https://www.retrox.app/callback',
      'scope': 'https://www.googleapis.com/auth/drive.file',
      'include_granted_scopes': 'true',
      'access_type': 'offline',
      'prompt': 'consent',
      'response_type': 'code',
      'state': window.location.pathname,
    };

    for (var p in params) {
      var input = document.createElement('input');
      input.setAttribute('type', 'hidden');
      input.setAttribute('name', p);
      input.setAttribute('value', params[p]);
      form.appendChild(input);
    }
  
    document.body.appendChild(form);
    form.submit();
  }

  // Get Google API Token
  async getToken() {
    const response = await fetch("https://api.retrox.app/profile/google", {
      method: "GET",
      credentials: 'include',
    })

    const json = await response.json()
    if (response.ok) this.#accessToken = json['token']
    else {
      if (response.status == 401) this.auth()
      throw new Error({"message": json['message']})
    }
  }

  // List files
  async listFiles(query, size=100, nextPageToken) {
    if (!this.#accessToken) await this.#init()
    const encodedQuery = query === undefined ? encodeURIComponent("trashed = false") : encodeURIComponent(query)
    const response = await fetch(`https://www.googleapis.com/drive/v3/files?q=${encodedQuery}&orderBy=name&fields=${encodeURIComponent('files(id,name,size,appProperties),nextPageToken')}${size ? `&pageSize=${size}` : ''}${nextPageToken ? `&pageToken=${nextPageToken}` : ''}`, {
      method: 'GET',
      headers: {
        "Authorization": `Bearer ${this.#accessToken}`,
      },
    })

    const json = await response.json()
    if (response.ok) return json
    else throw new Error(json['error']['message'])
  }

  async createFolder(folderName, parentFolderID) {    
    if (!this.#accessToken) await this.#init()
    var metadata = {
      'name': folderName,
      'mimeType': "application/vnd.google-apps.folder",
      'parents': parentFolderID === undefined ? [] : [parentFolderID],
    };

    var form = new FormData();
    form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));

    const response = await fetch('https://www.googleapis.com/upload/drive/v3/files?fields=id', {
      method: 'POST',
      headers: {
        "Authorization": `Bearer ${this.#accessToken}`,
      },
      body: form
    })

    const json = await response.json()
    if (response.ok) return json.id
    else throw new Error(json['error']['message'])
  }

  // Upload file to Google Drive
  async createFile(fileName, fileContent, fileMetadata, parentFolderName, onProgress, element) {
    if (!this.#accessToken) await this.#init()
    return new Promise((resolve, reject) => {
      // Initialize a new XMLHttpRequest object
      this.#xhr = new XMLHttpRequest();
      this.#xhr.open("POST", "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id");
      this.#xhr.setRequestHeader('Authorization', `Bearer ${this.#accessToken}`);

      // Track Upload progress
      this.#xhr.upload.onprogress = (event) => { onProgress(event, element) };

      // Track Completion
      this.#xhr.onloadend = () => {
        if (this.#xhr.status == 200) {
          resolve(JSON.parse(this.#xhr.responseText)['id']);
        }
        else if (this.#xhr.status == 0) {
          console.error("The upload operation has been aborted.");
          reject("The upload operation has been aborted.");
        }
        else {
          console.error(`Error ${this.#xhr.status}: ${JSON.parse(this.#xhr.responseText)['error']['message']}`);
          reject(JSON.parse(this.#xhr.responseText)['error']['message']);
        }
      };

      // Define body parameters
      var metadata = {
        'name': fileName,
        'appProperties': fileMetadata,
        'mimeType': fileContent.type,
        'parents': parentFolderName === undefined ? [] : [this.#folders[parentFolderName]],
      };

      var form = new FormData();
      form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
      form.append('file', fileContent);

      // Start the request
      this.#xhr.send(form);
    })
  }

  async renameFile(fileID, fileName, fileMetadata) {
    if (!this.#accessToken) await this.#init()
    var metadata = {
      'name': fileName,
      'appProperties': fileMetadata,
    };
    var form = new FormData();
    form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));

    this.#controller = new AbortController();
    const response = await fetch(`https://www.googleapis.com/upload/drive/v3/files/${fileID}?uploadType=multipart&fields=id`, {
      method: 'PATCH',
      headers: {
        "Authorization": `Bearer ${this.#accessToken}`,
      },
      signal: this.#controller.signal,
      body: form,
    })

    const json = await response.json()
    if (response.ok) return json['id']
    else throw new Error(json['error']['message'])
  }

  // Get file from Google Drive
  async getFile(fileID) {
    if (!this.#accessToken) await this.#init()
    this.#controller = new AbortController();
    const response = await fetch(`https://www.googleapis.com/drive/v3/files/${fileID}?alt=media`, {
      method: 'GET',
      headers: {
        "Authorization": `Bearer ${this.#accessToken}`,
      },
      signal: this.#controller.signal,
    })
    return response
  }

  // Delete file from Google Drive
  async deleteFile(fileID) {
    if (!this.#accessToken) await this.#init()
    const response = await fetch(`https://www.googleapis.com/drive/v3/files/${fileID}`, {
      method: 'DELETE',
      headers: {
        "Authorization": `Bearer ${this.#accessToken}`,
      },
    })

    if (!response.ok) {
      const json = await response.json()
      throw new Error(json['error']['message'])
    }
  }

  // Abort Operation
  abort() {
    this.#xhr.abort()
    this.#controller.abort()
  }

  // Compress Data to gzip
  async compress(data) {
    const stream = data instanceof Blob ? data.stream() : new Blob([data]).stream();
    const compressedStream = stream.pipeThrough(new CompressionStream("gzip"));
    const compressedResponse = await new Response(compressedStream);
    return await compressedResponse.blob();
  }

  // Decompress gzip data
  async decompress(blob) {
    let decompressionStream = new DecompressionStream("gzip");
    let decompressedStream = blob.stream().pipeThrough(decompressionStream);
    return await new Response(decompressedStream).blob();
  }

  async test() {
    // List all items (again)
    console.log("List items:")
    list = await this.listFiles()
    console.log(list)

    // Get item content
    console.log(`Getting file: ${fileId}...`)
    try {
      // Start the fetch, obtain a reader and get total length
      const response = await this.getFile(fileId)
      const reader = response.body.getReader();
      const contentLength = +response.headers.get('Content-Length');

      // Read the data
      let receivedLength = 0;
      let chunks = [];
      while (true) {
        const {done, value} = await reader.read();
        if (done) {
          break;
        }
        chunks.push(value);
        receivedLength += value.length;
        console.log(`Progress: ${(Math.round(receivedLength * 100) / contentLength).toFixed(2)}%`)
      }

      // Convert chunks to blob
      let blob_compressed = new Blob(chunks);

      // Decompress
      let blob = await this.decompress(blob_compressed)

      // Read text
      let text = await blob.text()
      console.log(text)

    } catch (error) {
      if (error.name == 'AbortError') {
        console.error("Get file aborted.");
      } else {
        console.error(error)
      }
    }
  }
}

const googleDriveAPI = new GoogleDriveAPI();
// googleDriveAPI.test()