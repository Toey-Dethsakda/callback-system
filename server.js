const express = require('express');
const connectDB = require('./src/utils/db');
const callbackRoutes = require('./src/routes/callbackRoutes');

const app = express();

connectDB();

app.use(express.json());

app.use('/callback', callbackRoutes);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));