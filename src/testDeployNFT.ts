import { deployNFT } from "./deployNFT.js";

const res = await deployNFT(
    'https://1c4d-103-82-135-107.ngrok-free.app/graphql',
    'EKFKDYWZHmyuLRGKy2LsRK5xR2qCsrmtc2CY6WLJgtABZn7TKTEW', // private key
    'B62qqF1nosawA3ybhNua98EQa7GDaxnL7vxMDJkZGZRiueR9XzYnmYD'
);

console.log(res);