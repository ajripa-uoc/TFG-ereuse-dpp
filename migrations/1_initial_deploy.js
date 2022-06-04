const DeviceFactory = artifacts.require("DeviceFactory");
const DocumentProofs = artifacts.require("DocumentProofs");
const AccessList = artifacts.require("AccessList");


module.exports = async function (deployer, network, accounts) {
  const adminAccesList = "0x2851e010738422CE8786D9F86e166Fc6E1030a1a"
  await deployer.deploy(AccessList, adminAccesList)
    .then(async function (instance) {
      roles = instance;
      console.log ("role address: " + roles.address)
      await deployer.deploy(DeviceFactory, roles.address)
  })
  await deployer.deploy(DocumentProofs);
};