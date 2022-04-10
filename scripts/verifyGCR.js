const hre = require('hardhat');

async function main(argument) {
        console.log('Verifying...', process.env.CONTRACT_ADDRESS);
        await hre.run("verify:verify", {
                address: process.env.CONTRACT_ADDRESS,
                constructorArguments: [await hre.ethers.constants.AddressZero],
                contract: 'contracts/GoldCoinReserve.sol:GoldCoinReserve'
        });
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    // spinner.fail();
    console.error(error);
    process.exit(1);
  });

