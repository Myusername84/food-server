import express from "express";
import "dotenv/config.js";
import cors from "cors";
import bodyParser from "body-parser";
import cookieParser from "cookie-parser";
import session from "express-session";
import passport from "passport";
import connect from "./mongoConnect.js";
import "./strategy.js";

const app = express();

//Middlewares

app.use(
  cors({
    origin: "https://food-client-bay.vercel.app/",
    credentials: true,
    methods: ["GET", "POST", "DELETE"],
  })
);
app.use(bodyParser.json());
app.use(cookieParser());

app.use(async (req, res, next) => {
  const db = await connect();
  req.db = db;

  next();
});

app.use(
  session({
    secret: process.env.SESSION_SECRET,
    saveUninitialized: false,
    resave: false,
    name: "MyCoolWebAppCookieName",

    cookie: {
      maxAge: 60000 * 60 * 10,
      sameSite: "none",
      secure: true,
      httpOnly: true,
    },
  })
);

app.use(passport.initialize());
app.use(passport.session());

//Authorization

app.post("/auth/logIn", async (req, res) => {
  const { email, password } = req.body;
  const user = await req.db.collection("users").findOne({ email: email });

  if (user && user.password === password && user.method === "local") {
    req.session.user = user;
    req.session.save();

    console.log("Session stored", req.session.user);

    res.status(200).send("User Authorized");
  } else {
    res.status(400).send("Bad Credentials");
  }
});

app.get(
  "/google",
  passport.authenticate("google", { scope: ["profile", "email"] })
);

app.get(
  "/google/callback",
  passport.authenticate("google", { failureRedirect: "/" }),
  async (req, res) => {
    req.session.user = req.user;
    res.redirect("https://food-client-bay.vercel.app/");
  }
);

app.post("/auth/register", async (req, res) => {
  const { email, password, name } = req.body;
  const user = await req.db.collection("users").findOne({ email: email });
  const length = await req.db.collection("users").countDocuments({});
  const cartsLength = await req.db.collection("carts").countDocuments({});

  if (!user && password != "" && name != "") {
    await req.db.collection("users").insertOne({
      ...req.body,
      _id: length + 1,
      method: "local",
    });

    await req.db.collection("carts").insertOne({
      _id: cartsLength + 1,
      userId: length + 1,
      items: [],
    });

    res.status(200).send("User created");
  } else {
    res.status(400).send("Bad Credentials");
  }
});

//Get Data

app.get("/burgers", async (req, res) => {
  const burgers = await req.db.collection("burgers").find({}).toArray();

  if (burgers) {
    res.status(200).send(burgers);
  } else {
    res.status(400).send("Burgers not found");
  }
});

app.post("/burgers", async (req, res) => {
  const { name, category } = req.body;

  if (category !== "None") {
    const burgers = await req.db
      .collection("burgers")
      .find({ name: { $regex: name, $options: "i" }, category: category })
      .toArray();

    res.status(200).send(burgers);
  } else {
    const burgers = await req.db
      .collection("burgers")
      .find({ name: { $regex: name, $options: "i" } })
      .toArray();

    res.status(200).send(burgers);
  }
});

app.get("/burgers/:id", async (req, res) => {
  const { id } = req.params;

  const burger = await req.db
    .collection("burgers")
    .findOne({ _id: Number(id) });

  res.status(200).send(burger);
});

app.get("/orders", async (req, res) => {
  const cartsCollection = req.db.collection("carts");
  const burgersCollection = req.db.collection("burgers");

  const pipeline = [
    { $match: { userId: req.session.user._id } },
    { $unwind: "$items" },
    {
      $lookup: {
        from: "burgers",
        localField: "items.id",
        foreignField: "_id",
        as: "burgerDetails",
      },
    },
    { $unwind: "$burgerDetails" },
    {
      $project: {
        _id: "$burgerDetails._id",
        name: "$burgerDetails.name",
        image: "$burgerDetails.image",
        count: "$items.count",
        price: "$burgerDetails.price",
      },
    },
  ];

  const result = await cartsCollection.aggregate(pipeline).toArray();
  res.status(200).send(result);
});

//Post

app.post("/cart", async (req, res) => {
  const { id, count } = req.body;
  const item = await req.db
    .collection("carts")
    .findOne({ userId: req.session.user._id, "items.id": id });

  if (item) {
    await req.db
      .collection("carts")
      .updateOne(
        { "items.id": id },
        { $inc: { "items.$.count": Number(count) } }
      );
  } else {
    await req.db
      .collection("carts")
      .updateOne(
        { userId: req.session.user._id },
        { $push: { items: { id: Number(id), count: Number(count) } } }
      );
  }
});

app.post("/changeCount", async (req, res) => {
  const { id, count } = req.body;

  const pipeline = [
    { $match: { userId: req.session.user._id } },
    { $unwind: "$items" },
    {
      $lookup: {
        from: "burgers",
        localField: "items.id",
        foreignField: "_id",
        as: "burgerDetails",
      },
    },
    { $unwind: "$burgerDetails" },
    {
      $project: {
        _id: "$burgerDetails._id",
        name: "$burgerDetails.name",
        image: "$burgerDetails.image",
        count: "$items.count",
        price: "$burgerDetails.price",
      },
    },
  ];

  await req.db
    .collection("carts")
    .updateOne(
      { userId: req.session.user._id, "items.id": id },
      { $set: { "items.$.count": count } }
    );

  const cartsCollection = req.db.collection("carts");
  const result = await cartsCollection.aggregate(pipeline).toArray();

  res.status(200).send(result);
});

app.get("/deleteItem/:id", async (req, res) => {
  const { id } = req.params;

  await req.db
    .collection("carts")
    .updateOne(
      { "items.id": Number(id) },
      { $pull: { items: { id: Number(id) } } }
    );

  const pipeline = [
    { $match: { userId: req.session.user._id } },
    { $unwind: "$items" },
    {
      $lookup: {
        from: "burgers",
        localField: "items.id",
        foreignField: "_id",
        as: "burgerDetails",
      },
    },
    { $unwind: "$burgerDetails" },
    {
      $project: {
        _id: "$burgerDetails._id",
        name: "$burgerDetails.name",
        image: "$burgerDetails.image",
        count: "$items.count",
        price: "$burgerDetails.price",
      },
    },
  ];

  const cartsCollection = req.db.collection("carts");
  const result = await cartsCollection.aggregate(pipeline).toArray();
  res.status(200).send(result);
});

app.get("/user", async (req, res) => {
  try {
    res.status(200).send(req.session.user);
  } catch (err) {
    console.log(err.message);
    res.status(400).send("Error");
  }
});

app.get("/signOut", async (req, res) => {
  if (req.session.user) {
    delete req.session.user;
    res.sendStatus(200);
  } else {
    res.sendStatus(200);
  }
});

//DELETE

app.delete("/deleteAccount", async (req, res) => {
  const userId = await req.session.user._id;
  await req.db.collection("users").deleteOne({ _id: userId });
  await req.db.collection("carts").deleteOne({ userId: userId });

  res.status(200).send("User successfully deleted");
});

app.listen(3001, () => console.log("Listening on port 3001..."));

// mongodb+srv://admin:<password>@mongodb.cg1qal5.mongodb.net/?retryWrites=true&w=majority&appName=mongoDB/directConnection=true
