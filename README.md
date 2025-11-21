## Introduction

**@zeroad.network/token** is a module meant to be used by partnering sites of [Zero Ad Network](https://zeroad.network) platform. It's a lightweight module that works on Nodejs 18 and above, and Bun 1.3 and above runtimes.

This node module allows a Zero Ad Network program partnering sites and Web APIs to verify determine if incoming web requests are coming from our browser extension users with active subscription.

Their browser extension will send the `X-Better-Web-Hello` Request Header which will let our module to verify it's our actively subscribed user and will allow your site to make a decision whether to disable ads, paywalls or enable access to otherwise paid content of yours.

ZeroAd user browser extension will measure how many times and how long they spent on each resource of your website that sends the `X-Better-Web-Welcome` token. This information will go back to us and at the end of each month based on how large the active user base is and how much competition you got, you'll get awarded from each user's monthly subscription paid amount based on their usage patterns interacting with your site.

## Setup

If you already have your site registered with us, you can skip the section below.

### Register your website or web API

Sign up with us by navigating in your browser to [sign up](https://zeroad.network/login), once you've logged in successfully, go to and [add a project](https://zeroad.network/publisher/sites/add) page and register your site.

In the second step of the Site registration process you'll be presented with your unique `X-Better-Web-Welcome` header value for that site. Your website must respond with this header in all publicly accessible endpoints that contain HTML or RESTful response types. This will let ZeroAd Network users know that you are participating in the program.

## Module Installation

This package works well within `mjs` (ESM) and `cjs` (CJS - older node versions) environments.

Install this package using your favourite package manager:

```shell
# npm
npm add @zeroad.network/token

# yarn
yarn add @zeroad.network/token

# pnpm
pnpm add @zeroad.network/token

# or Bun
bun add @zeroad.network/token
```

# Examples

Take the example as a reference only. The most basic, and honestly, quite complete use with `express` could look similar to this:

```js
import express from "express";
import {
  init,
  getServerHeaderName,
  getServerHeaderValue,
  processRequest,
  getClientHeaderName,
} from "@zeroad.network/token";

const app = express();
const port = 3000;

// Welcome Header Value acquired during Site Registration process at Zero Ad Network platform
const ZERO_AD_PARTNER_HEADER_VALUE = "AZqnKU56eIC7vCD1PPlwhg^1^3";

// Initialize your Zero Ad Network module
init({ value: ZERO_AD_PARTNER_HEADER_VALUE });

app
    .use((req, res, next) => {
        // X-Better-Web-Welcome header injection can could have it's own simple middleware like this:
        res.header(getServerHeaderName(), getServerHeaderValue())
    })
    .use((req, res, next) => {
        const result = await processRequest(c.req.header(getClientHeaderName()));

        res.locals.disableAds = result.shouldRemoveAds();
        res.locals.removePaywalls = result.shouldEnablePremiumContentAccess();
        res.locals.vipExperience = result.shouldEnableVipExperience();

        next();
    })
    .get('/', (req, res) => {
        // The "locals.disableAds" variable can now be used to suppress rendering
        // of ads and 3rd party non-functional trackers.

        // The "locals.removePaywalls" variable can allow users to bypass pay-walled content.
        res.render('index.ejs');
    });

app.listen(port, () => {
  console.log(`Server listening at http://localhost:${port}`);
});
```

P.S.: Each web request coming from active subscriber using their Zero Ad Network browser extension will incur a fraction of CPU computation cost to verify the token data matches its encrypted signature. On modern web infrasctructure a request execution time will increase roughly by ~0.1ms to 3ms or so.

In near future we will aim to add some form of "Request Header to processed result" caching mechanism for Redis users. In real life, Redis usually will deliver such payload slower than it would take to verify attached cryptographic token signature.

# Final thoughts

If no user of ours interacts with your website or web app, you lose nothing. You can keep showing ads to normal users, keep your paywalls etc.

We hope the opposite will happen and you'll realize how many people value pure, clean content created that is meant for them, actual people, that brings tangible and meaningful value for everyone.

Each website that joins us, becomes a part of re-making the web as it originally was intended to be - a joyful and wonderful experience once again.

**Thank you!**

> The "Zero Ad Network" team.
