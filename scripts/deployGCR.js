const hre = require('hardhat')

async function main() {
	const signers = await hre.ethers.getSigners();

	const GCR = await hre.ethers.getContractFactory('GoldCoinReserve');
	const gcr = await GCR.connect(signers[0]).deploy(await hre.ethers.constants.AddressZero);
	
	await gcr.deployed();

	console.log('Contract deployed at:', gcr.address);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.log(error);
    process.exit(1);
  });

