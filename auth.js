// ============================================================
//  DevTutor — auth.js   (Firebase Auth + Firestore)
// ============================================================

// ── 1. Firebase SDK – dynamic loader ─────────────────────────
const _FB_VER = "10.12.0";
const _FB_SCRIPTS = [
    `https://www.gstatic.com/firebasejs/${_FB_VER}/firebase-app-compat.js`,
    `https://www.gstatic.com/firebasejs/${_FB_VER}/firebase-auth-compat.js`,
    `https://www.gstatic.com/firebasejs/${_FB_VER}/firebase-firestore-compat.js`,
];

function _loadScript(src) {
    return new Promise(function (resolve, reject) {
        var s = document.createElement("script");
        s.src = src;
        s.onload = resolve;
        s.onerror = function () { reject(new Error("Failed to load: " + src)); };
        document.head.appendChild(s);
    });
}

// ── 2. Firebase Config ────────────────────────────────────────
var _firebaseConfig = {
    apiKey:            "AIzaSyCF-V9Jui5JYBCfqOxob2aFwQlciP56I0U",
    authDomain:        "devtutor-5a697.firebaseapp.com",
    projectId:         "devtutor-5a697",
    storageBucket:     "devtutor-5a697.firebasestorage.app",
    messagingSenderId: "787597001496",
    appId:             "1:787597001496:web:b9889f2e2e9c39a5a5d46d",
    measurementId:     "G-G0L8HYCZQF"
};

// ── 3. Global Promise – resolves when Firebase is ready ───────
var _fbReadyResolve;
window.firebaseReady = new Promise(function (resolve) { _fbReadyResolve = resolve; });

// Internal references
var _auth, _db;

// Load SDK sequentially (compat SDK requires this order)
(async function () {
    try {
        for (var i = 0; i < _FB_SCRIPTS.length; i++) {
            await _loadScript(_FB_SCRIPTS[i]);
        }
        if (!firebase.apps.length) {
            firebase.initializeApp(_firebaseConfig);
        }
        _auth = firebase.auth();
        _db   = firebase.firestore();
        _fbReadyResolve({ auth: _auth, db: _db });
    } catch (e) {
        console.error("[DevTutor] Firebase init error:", e);
    }
})();

// ── 4. User data cache ────────────────────────────────────────
var _cachedUserData = null;

/** Returns the currently signed-in user's Firestore profile (or null). */
window.getCurrentUser = function () { return _cachedUserData; };

async function _getUserData(uid) {
    try {
        var snap = await _db.collection("users").doc(uid).get();
        return snap.exists ? Object.assign({ uid: uid }, snap.data()) : null;
    } catch (e) {
        console.error("[DevTutor] getUserData error:", e);
        return null;
    }
}

// ── 5. Logout ─────────────────────────────────────────────────
function logout() {
    if (_auth) {
        _auth.signOut().then(function () {
            _cachedUserData = null;
            window.location.href = "index.html#auth-section";
        });
    }
}

// ── 6. Navigation ─────────────────────────────────────────────
function updateNavigation(user) {
    var nav = document.querySelector("nav");
    if (!nav) return;

    var path     = window.location.pathname.toLowerCase();
    var pageName = path.substring(path.lastIndexOf("/") + 1) || "index.html";
    var isDash   = pageName.includes("dashboard.html") || pageName.includes("editor.html");

    var links = [
        { text: "Home",      href: "index.html"      },
        { text: "Tutorials", href: "tutorials.html"   },
        { text: "Editor",    href: "editor.html"      },
    ];

    if (user) {
        links.push({ text: "Dashboard",               href: "dashboard.html" });
        links.push({ text: "Logout (" + user.name + ")", href: "#", action: "logout" });
    } else {
        links.push({ text: "Login", href: "index.html#auth-section" });
    }

    nav.innerHTML = "";
    links.forEach(function (link, i) {
        var a = document.createElement("a");
        a.textContent = link.text;
        a.href = link.href;
        if (link.action === "logout") {
            a.addEventListener("click", function (e) { e.preventDefault(); logout(); });
        }
        nav.appendChild(a);
        if (!isDash && i < links.length - 1) {
            nav.appendChild(document.createTextNode(" | "));
        }
    });
}

// ── 7. Track Course Progress (global, called from course pages) ─
window.trackCourseProgress = async function (courseKey, pct, label) {
    await window.firebaseReady;
    var fbUser = _auth.currentUser;
    if (!fbUser) return;

    try {
        var userRef = _db.collection("users").doc(fbUser.uid);
        var snap    = await userRef.get();
        var data    = snap.data() || {};
        var cp      = data.courseProgress || {};
        var prevPct = cp[courseKey] || 0;
        cp[courseKey] = Math.min(100, Math.max(0, pct));

        var activity = data.activity || [];
        var now = new Date();
        var timeStr = now.toLocaleDateString("en-US", { month: "short", day: "numeric" })
                    + " " + now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });

        var actText = "";
        if (pct >= 100 && prevPct < 100) {
            actText = "Completed " + label + " course 🎉";
        } else if (pct > prevPct) {
            actText = "Made progress on " + label + " (" + pct + "%)";
        } else if (pct < prevPct) {
            actText = "Reset progress on " + label;
        }

        if (actText) {
            activity.push({ text: actText, time: timeStr });
            if (activity.length > 50) activity.shift();
        }

        await userRef.update({ courseProgress: cp, activity: activity });

        // Keep cache fresh
        if (_cachedUserData) {
            _cachedUserData.courseProgress = cp;
            _cachedUserData.activity = activity;
        }
    } catch (e) {
        console.error("[DevTutor] trackCourseProgress error:", e);
    }
};

// ── 8. DOM Ready ──────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", async function () {
    await window.firebaseReady;

    var path     = window.location.pathname.toLowerCase();
    var pageName = path.substring(path.lastIndexOf("/") + 1) || "index.html";

    // ── Auth state observer ────────────────────────────────────
    _auth.onAuthStateChanged(async function (fbUser) {
        if (fbUser) {
            _cachedUserData = await _getUserData(fbUser.uid);
        } else {
            _cachedUserData = null;
        }

        updateNavigation(_cachedUserData);

        // ── Dashboard page ─────────────────────────────────────
        if (pageName.includes("dashboard.html")) {
            if (!fbUser) {
                window.location.href = "index.html#auth-section";
                return;
            }
            // Signal dashboard.html that data is ready
            document.dispatchEvent(new CustomEvent("devtutor:authReady", {
                detail: { user: _cachedUserData, fbUser: fbUser }
            }));
        }

        // ── Auth section on index.html ─────────────────────────
        var authSection = document.getElementById("auth-section");
        if (authSection) {
            authSection.style.display = fbUser ? "none" : "block";
        }
    });

    // ── Login form ─────────────────────────────────────────────
    var loginForm = document.getElementById("login-form") ||
        (pageName.includes("login.html") ? document.querySelector("form") : null);

    if (loginForm) {
        loginForm.removeAttribute("action");

        var loginError = loginForm.querySelector("#login-error");
        if (!loginError) {
            loginError = document.createElement("div");
            loginError.id = "login-error";
            loginError.style.cssText = "color:#f87171;margin-top:15px;font-size:14px;text-align:center;display:none;";
            var lSubmit = loginForm.querySelector("button[type=submit]");
            if (lSubmit) loginForm.insertBefore(loginError, lSubmit);
            else loginForm.appendChild(loginError);
        }

        loginForm.addEventListener("submit", async function (e) {
            e.preventDefault();
            loginError.style.display = "none";
            loginError.textContent = "";

            var emailEl = loginForm.querySelector("#login-email") ||
                          loginForm.querySelector("#email") ||
                          loginForm.querySelector("input[type=email]");
            var passEl  = loginForm.querySelector("#login-password") ||
                          loginForm.querySelector("#password") ||
                          loginForm.querySelector("input[type=password]");

            if (!emailEl || !passEl) { _showErr(loginError, "Form inputs not found."); return; }

            var email    = emailEl.value.trim();
            var password = passEl.value;
            var btn      = loginForm.querySelector("button[type=submit]");

            _setBtnLoading(btn, "Signing in…");
            try {
                await _auth.signInWithEmailAndPassword(email, password);
                window.location.href = "dashboard.html";
            } catch (err) {
                _resetBtn(btn, "Login");
                var msg = "Invalid email address or password.";
                if (err.code === "auth/invalid-email")       msg = "Please enter a valid email address.";
                if (err.code === "auth/too-many-requests")   msg = "Too many failed attempts. Try again later.";
                if (err.code === "auth/network-request-failed") msg = "Network error. Check your connection.";
                _showErr(loginError, msg);
            }
        });
    }

    // ── Register form ──────────────────────────────────────────
    var regForm = document.getElementById("register-form") ||
        (pageName.includes("register.html") ? document.querySelector("form") : null);

    if (regForm) {
        regForm.removeAttribute("action");

        var regError = regForm.querySelector("#register-error");
        if (!regError) {
            regError = document.createElement("div");
            regError.id = "register-error";
            regError.style.cssText = "color:#f87171;margin-top:15px;font-size:14px;text-align:center;display:none;";
            var rSubmit = regForm.querySelector("button[type=submit]");
            if (rSubmit) regForm.insertBefore(regError, rSubmit);
            else regForm.appendChild(regError);
        }

        regForm.addEventListener("submit", async function (e) {
            e.preventDefault();
            regError.style.display = "none";
            regError.textContent = "";

            var fullNameEl  = regForm.querySelector("#register-fullName")  || regForm.querySelector("#fullName");
            var emailEl     = regForm.querySelector("#register-email")     || regForm.querySelector("#email")    || regForm.querySelector("input[type=email]");
            var usernameEl  = regForm.querySelector("#register-username")  || regForm.querySelector("#username");
            var pwInputs    = regForm.querySelectorAll("input[type=password]");
            var passEl      = regForm.querySelector("#register-password")  || regForm.querySelector("#password")  || pwInputs[0];
            var confirmEl   = regForm.querySelector("#register-confirmPassword") || regForm.querySelector("#confirmPassword") || pwInputs[1];

            if (!fullNameEl || !emailEl || !usernameEl || !passEl || !confirmEl) {
                _showErr(regError, "Form inputs not found."); return;
            }

            var fullName   = fullNameEl.value.trim();
            var email      = emailEl.value.trim();
            var username   = usernameEl.value.trim().toLowerCase();
            var password   = passEl.value;
            var confirmPw  = confirmEl.value;

            if (!fullName)               { _showErr(regError, "Full name is required."); return; }
            if (password !== confirmPw)  { _showErr(regError, "Passwords do not match!"); return; }
            if (password.length < 6)     { _showErr(regError, "Password must be at least 6 characters."); return; }

            var btn = regForm.querySelector("button[type=submit]");
            _setBtnLoading(btn, "Creating account…");

            try {
                // Check username uniqueness in Firestore
                var uCheck = await _db.collection("users").where("username", "==", username).get();
                if (!uCheck.empty) {
                    _resetBtn(btn, "Create Account");
                    _showErr(regError, "Username is already taken!"); return;
                }

                // Create Firebase Auth user
                var cred = await _auth.createUserWithEmailAndPassword(email, password);
                var uid  = cred.user.uid;

                var months = ["January","February","March","April","May","June",
                              "July","August","September","October","November","December"];
                var now    = new Date();
                var joined = months[now.getMonth()] + " " + now.getFullYear();

                var newUser = {
                    name:     fullName,
                    email:    email,
                    username: username,
                    joined:   joined,
                    courseProgress: {
                        html:0, css:0, javascript:0, bootstrap:0, react:0,
                        php:0, python:0, nodejs:0, sql:0, mysql:0
                    },
                    activity: []
                };

                await _db.collection("users").doc(uid).set(newUser);
                window.location.href = "dashboard.html";

            } catch (err) {
                _resetBtn(btn, "Create Account");
                var msg = "Registration failed. Please try again.";
                if (err.code === "auth/email-already-in-use") msg = "Email is already registered!";
                if (err.code === "auth/weak-password")        msg = "Password is too weak (min 6 chars).";
                if (err.code === "auth/invalid-email")        msg = "Please enter a valid email address.";
                if (err.code === "auth/network-request-failed") msg = "Network error. Check your connection.";
                _showErr(regError, msg);
            }
        });
    }
});

// ── 9. Auth tab switcher (index.html) ─────────────────────────
window.switchAuthTab = function (tab) {
    var loginTab  = document.querySelector(".auth-tab[onclick*='login']");
    var regTab    = document.querySelector(".auth-tab[onclick*='register']");
    var loginBox  = document.getElementById("login-container");
    var regBox    = document.getElementById("register-container");
    if (!loginTab || !regTab || !loginBox || !regBox) return;
    if (tab === "login") {
        loginTab.classList.add("active"); regTab.classList.remove("active");
        loginBox.style.display = "block"; regBox.style.display = "none";
    } else {
        regTab.classList.add("active"); loginTab.classList.remove("active");
        regBox.style.display = "block"; loginBox.style.display = "none";
    }
};

// ── Helpers ───────────────────────────────────────────────────
function _showErr(el, msg) {
    el.textContent = msg;
    el.style.display = "block";
}
function _setBtnLoading(btn, text) {
    if (!btn) return;
    btn.disabled = true;
    btn._origText = btn.textContent;
    btn.textContent = text;
}
function _resetBtn(btn, fallback) {
    if (!btn) return;
    btn.disabled = false;
    btn.textContent = btn._origText || fallback;
}

// ── 10. Google Sign-In ───────────────────────────────────────
window.signInWithGoogle = async function (errContainerId) {
    await window.firebaseReady;
    var provider = new firebase.auth.GoogleAuthProvider();
    var errEl = errContainerId ? document.getElementById(errContainerId) : null;
    if (!errEl) {
        errEl = document.getElementById("login-error") || document.getElementById("register-error");
    }
    if (errEl) { errEl.style.display = "none"; errEl.textContent = ""; }

    try {
        var result = await _auth.signInWithPopup(provider);
        var fbUser = result.user;
        if (!fbUser) return;

        var userRef = _db.collection("users").doc(fbUser.uid);
        var doc = await userRef.get();

        if (!doc.exists) {
            var months = ["January","February","March","April","May","June",
                          "July","August","September","October","November","December"];
            var now    = new Date();
            var joined = months[now.getMonth()] + " " + now.getFullYear();
            var username = fbUser.email ? fbUser.email.split("@")[0] : "user_" + fbUser.uid.substring(0, 5);

            var newUser = {
                name:     fbUser.displayName || "DevTutor Learner",
                email:    fbUser.email || "",
                username: username,
                joined:   joined,
                courseProgress: {
                    html:0, css:0, javascript:0, bootstrap:0, react:0,
                    php:0, python:0, nodejs:0, sql:0, mysql:0
                },
                activity: []
            };
            await userRef.set(newUser);
        }

        window.location.href = "dashboard.html";
    } catch (err) {
        console.error("[DevTutor] Google Sign-In Error:", err);
        if (errEl) {
            var msg = "Google Sign-In failed. Please try again.";
            if (err.code === "auth/popup-closed-by-user") msg = "Sign-in popup was closed before completing.";
            if (err.code === "auth/cancelled-popup-request") return;
            if (err.code === "auth/network-request-failed") msg = "Network error. Check your connection.";
            _showErr(errEl, msg);
        }
    }
};
