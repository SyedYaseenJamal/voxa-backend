import dotenv from 'dotenv';

dotenv.config();

const required = ['MONGO_URI'];
const missing = required.filter(key => !process.env[key]);
if (missing.length) {
  console.error(Missing required environment variables: );
  process.exit(1);
}
