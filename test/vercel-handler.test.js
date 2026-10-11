import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
test("serverless handler accepts a Vercel parsed JSON body without starting a listener", () => {
  const dir = mkdtempSync("/tmp/kitoko-handler-");
  try {
    execFileSync(
      process.execPath,
      [
        "--input-type=module",
        "-e",
        `
 import handler from './api/index.js';
 let code,payload;
 const req={url:'/api/orders',method:'POST',headers:{'content-type':'application/json',host:'kitoko.example'},body:{customer:{name:'Serverless test',email:'test@example.com',pickup:'Tongeren'},items:[{id:1,quantity:1}]}};
 const res={setHeader(){},writeHead(status){code=status;},end(body){payload=JSON.parse(body);}};
 await handler(req,res);
 if(code!==201||!payload.id)throw Error('Vercel handler order failed: '+JSON.stringify(payload));
 `,
      ],
      {
        env: {
          ...process.env,
          VERCEL: "",
          TURSO_DATABASE_URL: "",
          TURSO_AUTH_TOKEN: "",
          DB_PATH: dir + "/test.sqlite",
          LIVE_CHECKOUT: "false",
        },
        stdio: "pipe",
      },
    );
    assert.ok(true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("Vercel without database serves demo catalog and rejects every write", () => {
  const output = execFileSync(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      `
 import handler from './api/index.js';
 for(const [url,method,expected] of [['/api/config','GET',200],['/api/products','GET',200],['/api/orders','POST',503],['/api/admin/products','POST',503]]){
  let result; const res={statusCode:200,setHeader(){},end(value){result=JSON.parse(value);}};
  await handler({url,method},res);
  if(res.statusCode!==expected)throw Error('Unexpected response: '+url);
  if(url==='/api/config'&&result.checkoutAvailable!==false)throw Error('Checkout must be disabled');
  if(url==='/api/products'&&result.length!==4)throw Error('Missing demo catalog');
 }
 console.log('ok');
 `,
    ],
    {
      env: { ...process.env, VERCEL: "1", TURSO_DATABASE_URL: "" },
      encoding: "utf8",
    },
  );
  assert.equal(output.trim(), "ok");
});
