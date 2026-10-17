import express from 'express';

const app = express();
const port = Number(process.env.PORT) || 3000;

app.use(express.json());

app.get('/', (_req, res) => {
  res.json({ status: 'ok', message: 'Backend rodando' });
});

app.get('/health', (_req, res) => {
  res.json({ status: 'up' });
});

app.listen(port, () => {
  console.log(`Servidor rodando em http://localhost:${port}`);
});
