const app = require('./app');

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`ICCC report server listening on http://localhost:${PORT}`);
});
