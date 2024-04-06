function onLoad() {
  // Check if user is already logged in
  if (localStorage.getItem('token')) {
    window.location.href = `${window.location.origin}/games.html`
  }

  // Check remember me option
  const username = document.getElementById("username");
  const remember = document.getElementById("remember");
  if (localStorage.getItem('remember')) {
    username.value = localStorage.getItem('username')
    remember.checked = true
  }

  // Fill welcome prompt
  const loginMessage = document.getElementById('loginMessage');
  if (localStorage.getItem('username') == null) loginMessage.innerHTML = 'Welcome back!'
  else loginMessage.innerHTML = `Welcome back, ${localStorage.getItem('username')}`
}

function turnstileCallback() {
  const submitButton = document.getElementById("submit");
  submitButton.removeAttribute("disabled");
}

function showAlert(type, message) {
  const loginAlert = document.getElementById('loginAlert')
  loginAlert.innerHTML = `
    <div class="alert alert-${type} alert-dismissible" role="alert">
      <div style="text-align:left">
        ${type == 'success'
        ? 
          `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-check-circle-fill" viewBox="0 0 16 16" style="margin-bottom:3px; margin-right:3px">
            <path d="M16 8A8 8 0 1 1 0 8a8 8 0 0 1 16 0m-3.97-3.03a.75.75 0 0 0-1.08.022L7.477 9.417 5.384 7.323a.75.75 0 0 0-1.06 1.06L6.97 11.03a.75.75 0 0 0 1.079-.02l3.992-4.99a.75.75 0 0 0-.01-1.05z"/>
          </svg>`
        :
          `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-exclamation-triangle-fill" viewBox="0 0 16 16" style="margin-bottom:3px; margin-right:3px">
            <path d="M8.982 1.566a1.13 1.13 0 0 0-1.96 0L.165 13.233c-.457.778.091 1.767.98 1.767h13.713c.889 0 1.438-.99.98-1.767zM8 5c.535 0 .954.462.9.995l-.35 3.507a.552.552 0 0 1-1.1 0L7.1 5.995A.905.905 0 0 1 8 5m.002 6a1 1 0 1 1 0 2 1 1 0 0 1 0-2"/>
          </svg>`
        }
        ${message}
      </div>
      <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
    </div>
  `
}

async function login(event) {
  // Prevent page to refresh
  event.preventDefault();

  // Get elements
  const username = document.getElementById("username");
  const password = document.getElementById("password");
  const remember = document.getElementById("remember");
  const cfToken = turnstile.getResponse();
  const submitButton = document.getElementById("submit");
  const submitLoading = document.getElementById("loading");

  // Check if all values are filled
  if (username.value.length == 0 || password.value.length == 0) {
    showAlert("warning", "Please fill out all fields.")
    return
  }

  // Disable the submit button
  submitButton.setAttribute("disabled", "");
  submitLoading.style.display = 'inline-flex';

  // Perform the Login request
  try {
    const response = await fetch("https://api.retrox.app/login/", {
      method: "POST",
      body: JSON.stringify({
        username: username.value.trim(),
        password: password.value.trim(),
        remember: remember.checked,
        token: cfToken,
      })
    })

    const json = await response.json()
    if (!response.ok) {
      turnstile.reset()
      showAlert("danger", json['message'])
    }
    else {
      localStorage.setItem('token', json['token'])
      localStorage.setItem('email', json['email'])
      localStorage.setItem('username', json['username'])
      localStorage.setItem('remember', json['remember'])
      window.location.href = `${window.location.origin}/games.html`
    }
  }
  catch (error) {
    showAlert("danger", "An error occurred. Please try again.")
  }
  finally {
    submitButton.removeAttribute("disabled");
    submitLoading.style.display = 'none';
  }
}

onLoad()