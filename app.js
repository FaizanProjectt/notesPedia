if (process.env.NODE_ENV != "production") {
  require("dotenv").config();
}

const express = require("express");
const app = express();
const path = require("path");
const mongoose = require("mongoose");
const multer = require("multer");
const { storage } = require("./cloudConfig");
const upload = multer({ storage });
const Note = require("./models/upload");
const flash = require("connect-flash");
const session = require("express-session");
const bcrypt = require("bcrypt");
const passport = require("passport");
const localStrategy = require("passport-local");
const user = require("./models/user");
const MongoStore = require("connect-mongo");
const { isloggedIn, ensureAdmin } = require("./middleware");
const Razorpay = require("razorpay");
const crypto = require("crypto");
const ejsMate = require("ejs-mate");

app.set("view engine", "ejs");
app.engine("ejs", ejsMate);
app.use(express.json());

// Razorpay instance
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

const dbUrl = process.env.ATLASDB_URL;

// Connect to MongoDB
mongoose
  .connect(dbUrl)
  .then(() => console.log("Connected to MongoDB"))
  .catch((err) => console.error(err));

const store = MongoStore.create({
  mongoUrl: dbUrl,
  crypto: {
    secret: process.env.SECRET,
  },
  touchAfter: 24 * 3600,
});

store.on("error", () => {
  console.log("ERROR IN MONGO SESSION STORE", err);
});

const sessionOptions = {
  store,
  secret: process.env.SECRET,
  resave: false,
  saveUninitialized: true,
  cookie: {
    expires: Date.now() + 7 * 24 * 60 * 60 * 1000,
    maxAge: 7 * 24 * 60 * 60 * 1000,
    HttpOnly: true,
  },
};

// Set up Express

app.set("views", path.join(__dirname, "views"));
app.use(express.static(path.join(__dirname, "public")));
app.use(express.urlencoded({ extended: true }));
app.use(session(sessionOptions));
app.use(flash());
app.use(passport.initialize());
app.use(passport.session());

passport.use(user.createStrategy());
passport.use(new localStrategy(user.authenticate()));
passport.serializeUser(user.serializeUser());
passport.deserializeUser(user.deserializeUser());

app.use((req, res, next) => {
  res.locals.success = req.flash("success");
  res.locals.error = req.flash("error");
  res.locals.currUser = req.user;
  next();
});

// Routes
app.get("/", (req, res) => {
  res.render("notes/index.ejs");
});

app.get("/notes", isloggedIn, (req, res) => {
  res.render("notes/upload.ejs");
});

app.post(
  "/notes",
  // noteValidate,
  upload.single("streamfile"),
  async (req, res) => {
    let { title, owner, desc } = req.body;
    let url = req.file.path;
    let filename = req.file.filename;

    // Log the file object to debug
    console.log("File:", filename);

    if (!filename) {
      return res.status(400).json({ message: "File is required" });
    }

    const newNote = new Note({
      title: title,
      owner: owner,
      desc: desc,
      fileUrl: { url, filename },
    });

    await newNote.save();
    console.log("successfully uploaded");
    req.flash("success", "uploaded Successfully!");
    res.redirect("/");
    //   res.send("successfully uploaded");
  }
);

// Fetch

app.get("/listnotes", isloggedIn, async (req, res) => {
  try {
    const showAllNotes = await Note.find();
    res.render("notes/showNotes.ejs", { showAllNotes });
  } catch (err) {
    console.error("Error fetching notes:", err);
    res.status(500).json({ message: "Error fetching notes" });
  }
});

// Register user

app.get("/register", (req, res) => {
  res.render("user/signup.ejs");
});

app.post("/register", async (req, res) => {
  let { username, email, password } = req.body;
  const newUser = new user({ email, username });
  const regdb = await user.register(newUser, password);
  console.log(regdb);
  req.flash("success", "Registered Successfully!");
  res.redirect("/notes");
});

// app.get("/listnotes/:id", async (req, res) => {
//   let { id } = req.params;
//   const allListing = await Note.findById(id);
//   console.log(allListing);
//   res.render("notes/explore.ejs", { allListing });
// });comment for payment integration

// app.get("/listnotes/:id", async (req, res) => {
//   let { id } = req.params;
//   const allListing = await Note.findById(id);
//   res.render("notes/explore.ejs", { allListing });
// });

// Create Razorpay Order
app.post("/createOrder/:id", isloggedIn, async (req, res) => {
  const { id } = req.params;

  const options = {
    amount: 900, // amount in smallest currency unit (₹9 = 900 paise)
    currency: "INR",
    receipt: `receipt_order_${id}`,
  };

  try {
    const order = await razorpay.orders.create(options);
    res.json(order);
    console.log(order);
  } catch (err) {
    console.error("Error creating order:", err);
    res.status(500).json({ message: "Unable to create order" });
  }
});

// Verify Payment
app.post("/verifyPayment", async (req, res) => {
  const { order_id, payment_id, signature } = req.body;

  const hmac = crypto.createHmac("sha256", process.env.RAZORPAY_KEY_SECRET);
  hmac.update(order_id + "|" + payment_id);
  const generated_signature = hmac.digest("hex");

  if (generated_signature === signature) {
    // Payment successful, proceed with the download
    res.json({ success: true });
  } else {
    res.json({ success: false });
  }
});

// Download Note after payment
app.get("/downloadNote/:id", isloggedIn, async (req, res) => {
  const { id } = req.params;
  const note = await Note.findById(id);

  if (!note) {
    req.flash("error", "Note not found");
    return res.redirect("/listnotes");
  }

  res.redirect(note.fileUrl.url);
});

// Individual Note Route (View and Download Button)
app.get("/listnotes/:id", async (req, res) => {
  let { id } = req.params;
  const allListing = await Note.findById(id);
  console.log(allListing);
  res.render("notes/explore.ejs", { allListing });
});

// const adminUser = new user({
//   username: "admin",
//   password: "faizan2303",
//   email: "adminfaizan@gmail.com",
//   isAdmin: true,
// });

// adminUser
//   .save()
//   .then(() => console.log("Admin user created"))
//   .catch((err) => console.log(err));

// Login user
app.get("/login", (req, res) => {
  res.render("user/login.ejs");
});

app.post(
  "/login",
  passport.authenticate("local", {
    failureRedirect: "/login",
    failureFlash: true,
  }),
  async (req, res) => {
    req.flash("success", "LoggedIn Successfully!");
    res.redirect("/notes");
  }
);

// Admin-Register
app.get("/register-admin", (req, res) => {
  res.render("user/register-admin.ejs");
});

app.post("/register-admin", (req, res) => {
  user.register(
    new user({
      username: req.body.username,
      email: req.body.email,
      isAdmin: true,
    }),
    req.body.password,
    (err, user) => {
      if (err) {
        return res.status(500).send("Error registering admin user");
      }
      passport.authenticate("local")(req, res, () => {
        res.redirect("/admin/dashboard");
      });
    }
  );
});

app.get("/admin/login", (req, res) => {
  res.render("user/admin-login.ejs");
});

app.post(
  "/admin/login",
  passport.authenticate("local", {
    successRedirect: "/admin/dashboard",
    failureRedirect: "/admin/login",
    failureFlash: true,
  })
);

app.get("/admin/dashboard", ensureAdmin, async (req, res) => {
  const totalDoc = await Note.countDocuments({});
  const fetchDoc = await Note.find();
  res.render("user/admin-dashboard.ejs", { totalDoc, fetchDoc });
});

app.get("/logout", (req, res) => {
  req.logout((err) => {
    if (err) {
      return next(err);
    }
    req.flash("success", "Logged out Successfully!");
    res.redirect("/");
  });
});

// Start the server
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
