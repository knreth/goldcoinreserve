require("@nomiclabs/hardhat-waffle");
require('@nomiclabs/hardhat-ethers');
require('@nomiclabs/hardhat-etherscan');

const fs = require('fs');

var mnemonic;

try {
    mnemonic = fs.readFileSync('.secret');
    mnemonic = mnemonic.toString().trim();
} catch (err) {
    console.log('Mnemonic not provided');
}

/**
 * @type import('hardhat/config').HardhatUserConfig
 */
module.exports = {
    defaultNetwork: 'hardhat',
    networks: {
        bsctest: {
            accounts: {
                count: 10,
                initialIndex: 0,
                mnemonic,
                path: "m/44'/60'/0'/0",
            },
            chainId: 97,
            url: "https://data-seed-prebsc-1-s1.binance.org:8545",
            gasPrice: 10000000000,
        },
        bscmain: {
            accounts: {
                count: 10,
                initialIndex: 0,
                mnemonic,
                path: "m/44'/60'/0'/0",
            },
            chainId: 56,
            url: "https://bsc-dataseed1.binance.org",
            gasPrice: 5000000000,
        },
    },

    solidity: {
        compilers: [{
            version: "0.8.4",
            settings: {
                optimizer: {
                    enabled: true,
                    runs: 200,
                },
            },
        }],
    },

    etherscan: {
        apiKey: process.env.API_KEY,
    },
};
