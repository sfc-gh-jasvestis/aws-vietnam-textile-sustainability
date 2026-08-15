/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  env: {
    SNOWFLAKE_ACCOUNT: process.env.SNOWFLAKE_ACCOUNT || '',
    SNOWFLAKE_DATABASE: process.env.DATABASE || '',
    SNOWFLAKE_SCHEMA: process.env.SCHEMA || '',
    SNOWFLAKE_WAREHOUSE: process.env.WAREHOUSE || '',
  },
};

module.exports = nextConfig;
