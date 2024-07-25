import passport from "passport";
import { Strategy } from "passport-google-oauth20";
import "dotenv/config.js";
import connect from "./mongoConnect.js";

passport.serializeUser((user, done) => {
  done(null, user);
});

passport.deserializeUser((obj, done) => {
  done(null, obj);
});

passport.use(
  new Strategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: "https://food-server-iohq.onrender.com/google/callback",
    },
    async function (accessToken, refreshToken, profile, done) {
      const db = await connect();
      const user = await db
        .collection("users")
        .findOne({ email: profile.emails[0].value });
      const length = await db.collection("users").countDocuments({});
      const cartsLength = await db.collection("carts").countDocuments({});

      if (!user || user == {}) {
        const newUser = {
          _id: length + 1,
          name: profile.displayName,
          email: profile.emails[0].value,
          method: "google",
          password: "",
        };

        const cart = {
          _id: cartsLength + 1,
          userId: length + 1,
          items: [],
        };

        await db.collection("users").insertOne(newUser);
        await db.collection("carts").insertOne(cart);

        done(null, newUser);
      } else {
        done(null, user);
      }
    }
  )
);
