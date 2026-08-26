const http = require('http');
const body = { email: 'a@a.com', username: 'a', password: 'a' };
const req = http.request('http://localhost:4000/auth/register', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  agent: false
}, (res) => {
  let data = '';
  res.on('data', c => data += c);
  res.on('end', () => console.log(res.statusCode, data));
});
req.write(JSON.stringify(body));
req.end();
