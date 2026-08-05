const LOCAL_API_URL = "http://localhost:4000";
const DEPLOYED_API_URL = "https://t0-do-1.onrender.com";
const isLocalFrontend = ["localhost", "127.0.0.1", ""].includes(window.location.hostname);

window.TODO_API_URL = isLocalFrontend ? LOCAL_API_URL : DEPLOYED_API_URL;