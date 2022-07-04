/*********************************************************************************
* The MIT License (MIT)                                                          *
*                                                                                *
* Copyright (c) 2021 KMi, The Open University UK                                 *
*                                                                                *
* Permission is hereby granted, free of charge, to any person obtaining          *
* a copy of this software and associated documentation files (the "Software"),   *
* to deal in the Software without restriction, including without limitation      *
* the rights to use, copy, modify, merge, publish, distribute, sublicense,       *
* and/or sell copies of the Software, and to permit persons to whom the Software *
* is furnished to do so, subject to the following conditions:                    *
*                                                                                *
* The above copyright notice and this permission notice shall be included in     *
* all copies or substantial portions of the Software.                            *
*                                                                                *
* THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR     *
* IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,       *
* FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL        *
* THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER     *
* LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,  *
* OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN      *
* THE SOFTWARE.                                                                  *
*                                                                                *
**********************************************************************************/

let web3 = {};

let quadsFinal = "";
let metadata = ""
let metadata2 = ""

let linkchains = {}
let ethereum = {}
let account = "";

let provider = {};
let signer = {}

let ipfscache = {};
let tokencache = {};
let contractcache = {};


/**
 * Start the metamask extension for user to login.
 */
async function loginToMetaMask() {

	let reply = await ethereum.request({ method: 'eth_requestAccounts' });

	if (ethereum.selectedAddress) {
		const button = document.getElementById('enableEthereumButton');
		button.disabled = true;

		enableMetaMaskButtons();

		account = ethereum.selectedAddress;
		document.getElementById('ethereumaccount').innerHTML = account;
	} else {
		alert("Please select a MetaMask account to use with this page");
	}
}

/**
 * Load RDF data from select file
 */
async function readLocalInputData(filefieldname, inputareaname, prefillAreasArray) {

	var filefield = document.getElementById(filefieldname);
	if (filefield) {
		var file = filefield.files[0];
		if (file) {
			var reader = new FileReader();

			reader.addEventListener("load", async () => {
				let input = reader.result;

				const inputarea = document.getElementById(inputareaname);
				inputarea.value = input;

				prefillAreasArray.forEach(function(elementname) {
					const nextelement = document.getElementById(elementname);
					nextelement.value = input;
				});
			}, false);

			reader.addEventListener('error', () => {
				console.error(`Error occurred reading file: ${file.name}`);
			});

			reader.readAsText(file);
		} else {
			alert("Please select a file first");
		}
	} else {
		alert("Please select a file first");
	}
}

/**
 * Call linkchains passing some triples and get back the verification metadata object for those triples
 */
async function getVerificationMetadata() {

	try {
		const inputarea = document.getElementById('inputarea');
		quadsFinal = inputarea.value;

		if (quadsFinal != "" && quadsFinal != null) {
			metadata = await linkchains.getVerificationMetadata(quadsFinal, {});

			const verificationMetadataResult = document.getElementById('verificationMetadataResult');
			verificationMetadataResult.value = JSON.stringify(metadata, null, 2);

			// also add to next stage for non solid workflow
			const verificationMetadata = document.getElementById('verificationmetadatainputarea');
			verificationMetadata.value = JSON.stringify(metadata, null, 2);

			// also add to next stage for non solid workflow
			const verificationMetadataTokenInputArea = document.getElementById('verificationMetadataTokenInputArea');
			verificationMetadataTokenInputArea.value = JSON.stringify(metadata, null, 2);
		} else {
			alert("Please select a file of RDF first");
		}
	} catch (e) {
		console.log(e);
	}
}

/**
 * Create the Token Contract on Rinkby - should just be done once - then the address stored in the config
 */
async function deployTokenAnchorContract(resultAreaName) {

	const resultAreaNameElement = document.getElementById(resultAreaName);

	const abi = cfg.RDFTokenContract.abi;
	const bytecode = cfg.RDFTokenContract.bytecode;

	try {
		// Create an instance of a Contract Factory
		const factory = new ethers.ContractFactory(abi, bytecode, signer);

		// Pass parameters to the constructor and deploy
		const contract = await factory.deploy();

		// The address the Contract WILL have once mined
		// See: https://ropsten.etherscan.io/address/0x2bd9aaa2953f988153c8629926d22a6a5f69b14e
		console.log(contract.address);

		// The transaction that was sent to the network to deploy the Contract
		// See: https://ropsten.etherscan.io/tx/0x159b76843662a15bd67e482dcfbee55e8e44efad26c5a614245e12a00d4b1a51
		console.log(contract.deployTransaction.hash);

		resultAreaNameElement.value = "Waiting to be mined....";

		// The contract is NOT deployed yet; we must wait until it is mined
		await contract.deployed();

		// get the transaction receipt from MetaMask
		const receipt = await provider.getTransactionReceipt(contract.deployTransaction.hash);
		console.log(receipt);

		return receipt;
	} catch (e) {
		console.log(e);
		resultAreaNameElement.value = e;
	}
}

/**
 * This uses the NFT.STORAGE platform to store data on the global IPFS
 * https://nft.storage/
 * Requires an API token -  total request body size limit of 100MB and no more than 30 requests with the same API token within a ten second window else 429 returned
 */
function storeToIPFS(content) {
    return new Promise(function (resolve, reject) {

		let xhr = new XMLHttpRequest();
		xhr.open("POST", cfg.NFT_STORAGE_API_UPLOAD_URL, true);
		xhr.setRequestHeader('Authorization', 'Bearer ' + cfg.NFT_STORAGE_API_KEY);
		xhr.onload = function (oEvent) {
            if (this.status >= 200 && this.status < 300) {
                resolve(xhr.response);
            } else {
                reject({
                    status: this.status,
                    statusText: xhr.statusText
                });
            }
		};
        xhr.onerror = function () {
            reject({
                status: this.status,
                statusText: xhr.statusText
            });
        };

		var blob = new Blob([content], {type: 'application/json'});

		xhr.send(blob);
    });
}

/**
 * Given a URL to some IPFS Token metadata, read in the data.
 */
function readFromIPFS(url) {
    return new Promise(function (resolve, reject) {

		// pull it from local cache if you can to save calls to NFT.Storage
		if (ipfscache[url] !== undefined) {
			resolve(ipfscache[url]);
		}

		let xhr = new XMLHttpRequest();
		xhr.open("GET", url, true);
		xhr.onload = function (oEvent) {
            if (this.status >= 200 && this.status < 300) {
				ipfscache[url] = this.responseText;
                resolve(this.responseText);
            } else {
                reject({
                    status: this.status,
                    statusText: xhr.statusText
                });
            }
		};
        xhr.onerror = function () {
            reject({
                status: this.status,
                statusText: xhr.statusText
            });
        };
		xhr.send();
    });
}

async function readTokenMetadata(anchor, options) {

	//anchor.type
	//anchor.address
	//anchor.account
	//anchor.transactionhash
	//anchor.tokenid

	const validateResult = document.getElementById('validateResult');

	const abi = cfg.RDFTokenContract.abi;
	const contractAddress = anchor.address;

	// check if it cached first
	if (tokencache[contractAddress] !== undefined
			&& tokencache[contractAddress][anchor.tokenId] !== undefined) {

		return tokencache[contractAddress][anchor.tokenId];
	}

	try {
		const theContract = new ethers.Contract(contractAddress, abi, provider);

		// get the token url
		const tokenURI = await theContract.tokenURI(parseInt(anchor.tokenId));

		// read from NFT Storage
		const response = await readFromIPFS(tokenURI);
		const ipfsmetadata = JSON.parse(response);

		if (ipfsmetadata.properties && ipfsmetadata.properties.merqlanchor) {

			const merqlanchor = ipfsmetadata.properties.merqlanchor;

			const dataObj = {
				leastSignificants: merqlanchor.settings.lsd,
				theDivisor: merqlanchor.settings.divisor,
				theIndexHashFunction: merqlanchor.settings.indexHash,
				theIndexType: merqlanchor.settings.indexType,
				theQuadHashFunction: merqlanchor.settings.quadHash,
				theTreeHashFunction: merqlanchor.settings.treeHash,
				thetargetHash: merqlanchor.indexhash,
				transactionAccount: merqlanchor.account,
				transactionContractAddress: merqlanchor.address
			}

			// get the transaction
			const receipt = await provider.getTransactionReceipt(anchor.transactionHash);
			dataObj.transactionAccount = receipt.from;
			dataObj.theOwner = receipt.from; // not strictly true - it will be the KMi account that owns the Token Contract - but I am not sure it matters for the summer school
			dataObj.transactionContractAddress = anchor.address;

			// get the block for the timestamp
			const block = await provider.getBlock(receipt.blockNumber);
			dataObj.theCreationTime = block.timestamp;

			tokencache[contractAddress] = {};
			tokencache[contractAddress][anchor.tokenId] = dataObj;

			return dataObj;
		} else {
			throw error("Miss-formed RDFToken metadata")
		}

	} catch (e) {
		console.log(e);
		validateResult.value = e;
	}
}

async function createTokenMetadata(name, description, imagefilepath, merqlanchor) {

	if (name && description && imagefilepath) {
		try {
			json = {};
			json.name = name;
			json.description = description;
			json.image = imagefilepath;

			json.properties = {}
			json.properties.merqlanchor = merqlanchor;

			let content = JSON.stringify(json);

			let result = await storeToIPFS(content);
			result = JSON.parse(result);

			/* Exmaple response
			{
				"ok": true,
				"value": {
					"cid": "bafkreigs6cwl23bd6763vgb3jq6ifhwmrzqaxuhq4b2cxedsttrfvku3d4",
					"created": "2022-06-16T15:50:07.68+00:00",
					"type": "application/json",
					"scope": "ISWS Summer School",
					"files": [],
					"size": 555,
					"name": "Upload at 2022-06-16T15:50:07.680Z",
					"pin": {
						"cid": "bafkreigs6cwl23bd6763vgb3jq6ifhwmrzqaxuhq4b2cxedsttrfvku3d4",
						"created": "2022-06-16T15:50:07.68+00:00",
						"size": 555,
						"status": "queued"
					},
					"deals": []
				}
			}
			*/

			let hash = result.value.cid;
			let metadataurl = cfg.NFT_STORAGE_IPFS_URL_STUB + hash;

			return metadataurl;

		} catch (e) {
			console.log(e);
			throw new Error("Failed to write token metadata file to IPFS");
		}

	} else {
		throw new Error("Missing required parameters for creating token metadata");
	}
}

/**
 * Helper function to help linkchains anchorMetadata function write to the blockchain and use MetaMask to sign the transaction
 */
 // https://www.quicknode.com/guides/web3-sdks/how-to-mint-an-nft-with-ethers-js
 // https://docs.alchemy.com/alchemy/tutorials/how-to-create-an-nft/how-to-mint-an-nft-with-ethers
async function issueToken(anchor, options) {

	const anchorMetadataResult = document.getElementById('anchorMetadataTokenResult');

	try {
		let name=options.tokenName;
		let description=options.tokenDescription;
		let imageurl = options.tokenImageURL; // could be passed in from an input on the page so students could change the default.

		const tokenurl = await createTokenMetadata(name, description, imageurl, anchor);

		const abi = cfg.RDFTokenContract.abi;

		const contractInstance = new ethers.Contract(options.address, abi, provider);

		anchorMetadataResult.value = "Waiting to be mined....";

		let tx = await contractInstance.connect(signer).mintToken(account, tokenurl);

        const contractReceipt = await tx.wait()
		const event = contractReceipt.events.find(event => event.event === 'TokenMint');
		const [recipient, url, tokenid] = event.args;
		const convertedtokenid = tokenid.toString();

		const result = {
			address: options.address,
			account: account,
			transactionHash: contractReceipt.transactionHash,
			tokenId: convertedtokenid,
		};

		return Object.assign(anchor, result);
	} catch (e) {
		console.log(e);
		anchorMetadataResult.value = e;
		throw(e);
	}
}

/**
 * Call linkchains to put the verification Metadata on the blockchain in a smart contract
 */
async function anchorMetadataWithToken() {

	try {
		const name = document.getElementById('tokenName').value;
		if (name.trim() == "" || name == null) {
			alert("please enter a name for this RDF Token");
			return;
		}
		const description = document.getElementById('tokenDescription').value;
		if (description == null || description.trim() == "") {
			alert("please enter a description for this RDF Token");
			return;
		}
		const imageurl = document.getElementById('tokenImageURL').value;
		if (imageurl == null || imageurl.trim() == "") {
			imageurl = cfg.tokenIconURL;
		}

		const verificationMetadataTokenInputArea = document.getElementById('verificationMetadataTokenInputArea');
		let dataToAnchor = "";
		if (verificationMetadataTokenInputArea.value != "") {
			dataToAnchor = verificationMetadataTokenInputArea.value;
		} else {
			alert("Please load the Verification Metadata to anchor to the blockchain");
			return;
		}

		const anchorMetadataResult = document.getElementById('anchorMetadataTokenResult');
		granularVerificationMetadataResult.value = "Depending on the input size, this can take a while. Please wait while processing..."

		let options = {
			address: cfg.tokenContractAddress,
			account: account,
			transactionHash:"0x0x0000000000000000000000000000000000000000",
			anchorType : 'RDFTokens',
			tokenName: name,
			tokenDescription: description,
			tokenImageURL: imageurl
		}

		const handler = async function(anchor, options) {
			let reply = await issueToken(anchor, options);
			return reply;
		}

		const anchoredMetadata = await linkchains.anchorMetadata(dataToAnchor, options, handler);

		anchorMetadataResult.value = JSON.stringify(anchoredMetadata, null, 2);

		// prefill the get granular metadata input area
		const anchoredMetadataInputArea = document.getElementById('anchoredMetadataInputArea');
		anchoredMetadataInputArea.value = JSON.stringify(anchoredMetadata, null, 2);

		// prefill the validate anchored metadata input area
		const anchoredMetadataValidationInputArea = document.getElementById('anchoredMetadataValidationInputArea');
		anchoredMetadataValidationInputArea.value = JSON.stringify(anchoredMetadata, null, 2);

		console.log(anchoredMetadata);

	} catch (error) {
		console.log(error);
		alert(error.message);
	}
}


/**
 * Helper function to help linkchains verify function read from the blockchain
 */
async function readMerQLAnchorContract(anchor, option) {

	//anchor.type
	//anchor.address
	//anchor.account
	//anchor.transactionhash

	const validateResult = document.getElementById('validateResult');

	const abi = cfg.MerQLAnchorContract.abi;
	contractAddress = anchor.address;

	// check if it cached first
	if (contractcache[contractAddress] !== undefined) {
		return contractcache[contractAddress];
	}

	try {
		const theContract = new ethers.Contract(contractAddress, abi, provider);
		let data = await theContract.getData();

		// this is needed as the returned data object is sort of an array - despite what this code may imply.
		const dataObj = {
			leastSignificants: parseInt(data.leastSignificants.toString()),
			theCreationTime: data.theCreationTime.toString(),
			theDivisor: parseInt(data.theDivisor.toString()),
			theIndexHashFunction: data.theIndexHashFunction.toString(),
			theIndexType: data.theIndexType.toString(),
			theOwner: data.theOwner.toString(),
			theQuadHashFunction: data.theQuadHashFunction.toString(),
			theTreeHashFunction: data.theTreeHashFunction.toString(),
			thetargetHash: data.thetargetHash.toString(),
		}

		// get the transaction
		const receipt = await provider.getTransactionReceipt(anchor.transactionHash);
		dataObj.transactionAccount = receipt.from;
		dataObj.transactionContractAddress = receipt.contractAddress;

		contractcache[contractAddress] = dataObj;

		return dataObj;

	} catch (e) {
		console.log(e);
		validateResult.value = e;
	}
}

/**
 * Helper function to help linkchains anchorMetadata function write to the blockchain and use MetaMask to sign the transaction
 */
async function deployMerQLAnchorContract(anchor, options) {

	const anchorMetadataResult = document.getElementById('anchorMetadataResult');
	const abi = cfg.MerQLAnchorContract.abi;
	const bytecode = cfg.MerQLAnchorContract.bytecode;

	try {
		const factory = new ethers.ContractFactory(abi, bytecode, signer);

		var indexHash = anchor.indexhash;
		var newIndexType = anchor.settings.indexType; //following lines take their values from merkleOutput too
		var lsds = anchor.settings.lsd;
		var div = ""+anchor.settings.divisor; // because it needs to be a string in the smart contract, not a number.
		var quadHashFunctionIn = anchor.settings.quadHash;
		var treeHashFunctionIn = anchor.settings.treeHash;
		var indexHashFunctionIn = anchor.settings.indexHash;

		var contractArgs = [
			indexHash,
			newIndexType,
			lsds,
			div,
			quadHashFunctionIn,
			treeHashFunctionIn,
			indexHashFunctionIn,
		];

		const contract = await factory.deploy(contractArgs[0],contractArgs[1],contractArgs[2],contractArgs[3],contractArgs[4],contractArgs[5],contractArgs[6]);

		anchorMetadataResult.value = "Waiting to be mined....";

		const receipt = await contract.deployTransaction.wait();

		const result = {
			address: receipt.contractAddress,
			account: account,
			transactionHash: receipt.transactionHash
		};

		return Object.assign(anchor, result);

	} catch (e) {
		console.log(e);
		anchorMetadataResult.value = e;
		throw(e);
	}
}


/**
 * Call linkchains to put the verification Metadata on the blockchain in a smart contract
 */
async function anchorMetadata() {

	try {
		let options = {}

		const verificationMetadata = document.getElementById('verificationmetadatainputarea');
		let dataToAnchor = "";
		if (verificationMetadata.value != "") {
			dataToAnchor = verificationMetadata.value;
		} else {
			alert("Please load the Verification Metadata to anchor to the blockchain");
			return;
		}

		const anchorMetadataResult = document.getElementById('anchorMetadataResult');
		anchorMetadataResult.value = "Depending on the input size, this can take a while. Please wait while processing..."

		//const handler = async function(anchor, options) {

		//	let reply = await deployMerQLAnchorContract(anchor, options);
		//	console.log("reply: "+reply);

		//	return reply;
		//}

		metadata2 = await linkchains.anchorMetadata(dataToAnchor, options, deployMerQLAnchorContract);

		anchorMetadataResult.value = JSON.stringify(metadata2, null, 2);

		// prefill the get granular metadata input area
		const anchoredMetadataInputArea = document.getElementById('anchoredMetadataInputArea');
		anchoredMetadataInputArea.value = JSON.stringify(metadata2, null, 2);

		// prefill the validate anchored metadata input area
		const anchoredMetadataValidationInputArea = document.getElementById('anchoredMetadataValidationInputArea');
		anchoredMetadataValidationInputArea.value = JSON.stringify(metadata2, null, 2);

	} catch (error) {
		console.log(error);
		anchorMetadataResult.value = error.message;
	}
}

/**
 * Call linkchains to get more detailed the verification Metadata
 */
async function getGranularVerificationMetadata() {

	const granularVerificationMetadataResult = document.getElementById('granularVerificationMetadataResult');

	try {
		const inputarea = document.getElementById('anchoredRDFInputArea');
		let rdfInputData = "";
		if (inputarea.value != "" && inputarea.value != null) {
			rdfInputData = inputarea.value;
		} else {
			alert("Please load the RDF to get granular verification metadata for");
			return;
		}

		const anchoredMetadata = document.getElementById('anchoredMetadataInputArea');
		let anchoredData = "";
		if (anchoredMetadata.value != "" && anchoredMetadata.value != null) {
			anchoredData = anchoredMetadata.value
		} else {
			alert("Please load the anchored metadata to get granular metadata for");
			return;
		}

		granularVerificationMetadataResult.value = "Depending on the input size, this can take a while. Please wait while processing..."

		const granularMetaData = await linkchains.getGranularVerificationMetadata(rdfInputData, anchoredData);

		granularVerificationMetadataResult.value = JSON.stringify(granularMetaData, null, 2);

		// prefill the validate granular metadata input area
		const granularMetadataValidationInputArea = document.getElementById('granularMetadataValidationInputArea');
		granularMetadataValidationInputArea.value = JSON.stringify(granularMetaData, null, 2);

	} catch (error) {
		console.log(error);
		granularVerificationMetadataResult.value = error.message;
	}
}

/**
 * Call linkchains to validate with anchored Metadata
 */
async function validate() {

	let options = {}
	const validateResult = document.getElementById('validateResult');

	try {

		const validateRDFInputArea = document.getElementById('validateRDFInputArea');
		let rdfInputData = "";
		if (validateRDFInputArea.value != "" && validateRDFInputArea.value != null) {
			rdfInputData = validateRDFInputArea.value;
		} else {
			alert("Please load the RDF to validate");
			return;
		}

		const anchoredMetadataValidationInputArea = document.getElementById('anchoredMetadataValidationInputArea');
		let anchoredMetaData = "";
		if (anchoredMetadataValidationInputArea.value != "" && anchoredMetadataValidationInputArea.value != null) {
			anchoredMetaData = anchoredMetadataValidationInputArea.value
		} else {
			alert("Please load the anchored metadata to use for validation");
			return;
		}

		const handler = async function(anchor, options) {

			// check if merkle or blockchain verification
			let reply = "";
			if (anchor.type == "ETHMerQL") {
				reply = await readMerQLAnchorContract(anchor, options);
			} else if (anchor.type == "RDFTokens") {
				reply = await readTokenMetadata(anchor, options);
			}

			return reply;
		}

		validateResult.value = "Depending on the input size, this can take a while. Please wait...";

		const output = await linkchains.verify(rdfInputData, anchoredMetaData, options, handler);

		validateResult.value = JSON.stringify(output, null, 2);
	} catch (e) {
		console.log(e);
		validateResult.value = e.message;
	}
}

/**
 * Call linkchains validate with granular metadata
 */
async function validateGranular() {

	let options = {}
	const validateGranularResult = document.getElementById('validateGranularResult');

	try {
		const validateGranularRDFInputArea = document.getElementById('validateGranularRDFInputArea');
		let rdfInputData = "";
		if (validateGranularRDFInputArea.value != "" && validateGranularRDFInputArea.value != null) {
			rdfInputData = validateGranularRDFInputArea.value;
		} else {
			alert("Please load the RDF to validate");
			return;
		}

		const granularMetadataValidationInputArea = document.getElementById('granularMetadataValidationInputArea');
		let granularMetaData = "";
		if (granularMetadataValidationInputArea.value != "" && granularMetadataValidationInputArea.value != null) {
			granularMetaData = granularMetadataValidationInputArea.value
		} else {
			alert("Please load the anchored metadata to use for validation");
			return;
		}

		const handler = async function(anchor, options) {

			// check if merkle or blockchain verification
			let reply = "";
			if (anchor.type == "ETHMerQL") {
				reply = await readMerQLAnchorContract(anchor, options);
			} else if (anchor.type == "RDFTokens") {
				reply = await readTokenMetadata(anchor, options);
			}

			console.log(reply);

			return reply;
		}

		validateGranularResult.value = "Depending on the input size, this can take a while. Please wait...";

		const output = await linkchains.verify(rdfInputData, granularMetaData, options, handler);

		validateGranularResult.value = JSON.stringify(output, null, 2);

	} catch (e) {
		console.log(e);
		validateGranularResult.value = e.message;
	}
}

/**
 * Enables metamask relatyed buttons after attached to metamask
 */
function enableMetaMaskButtons() {

	const anchorMetadataButton = document.getElementById('anchorMetadataButton'); // write to blockchain
	const anchorMetadataTokenButton = document.getElementById('anchorMetadataTokenButton'); // write to blockchain
	const validateButton = document.getElementById('validateButton'); // read from blockchain?
	const validateGranularButton = document.getElementById('validateGranularButton'); // read from blockchain?

	anchorMetadataButton.disabled = false;
	anchorMetadataTokenButton.disabled = false;
	validateButton.disabled = false;
	validateGranularButton.disabled = false;
}

function enableSolidButtons() {

	/** Tab to connect to Solid and view files **/
	const solidLoginButton = document.querySelector("#solidLoginButton");
	solidLoginButton.disabled=true;

	const solidLogoutButton = document.querySelector("#solidLogoutButton");
	solidLogoutButton.disabled=false;

	const readFileFromSolidButton = document.querySelector("#readFileFromSolidButton");
	readFileFromSolidButton.disabled=false;

	/** Tab to get Verification Metadata for some RDF Input **/
	const saveFileDataButton = document.querySelector("#saveFileDataButton");
	saveFileDataButton.disabled=false;
	const readSolidDataButton = document.querySelector("#readSolidDataButton");
	readSolidDataButton.disabled=false;
	const storeVerificationMetadataButton = document.querySelector("#storeVerificationMetadataButton");
	storeVerificationMetadataButton.disabled=false;

	/** Tab to Anchor Verification Metadata to the Blockchain **/
	const readVerificationMetadataButton = document.querySelector("#readVerificationMetadataButton");
	readVerificationMetadataButton.disabled=false;
	const saveVerificationMetadataFileButton = document.querySelector("#saveVerificationMetadataFileButton");
	saveVerificationMetadataFileButton.disabled=false;
	const storeAnchorMetadataButton = document.querySelector("#storeAnchorMetadataButton");
	storeAnchorMetadataButton.disabled=false;

	/** Tab to Anchor Verification Metadata to the Blockchain with a Token **/
	const readVerificationMetadataTokenButton = document.querySelector("#readVerificationMetadataTokenButton");
	readVerificationMetadataTokenButton.disabled=false;
	const saveVerificationMetadataTokenFileButton = document.querySelector("#saveVerificationMetadataTokenFileButton");
	saveVerificationMetadataTokenFileButton.disabled=false;
	const storeAnchorMetadataTokenButton = document.querySelector("#storeAnchorMetadataTokenButton");
	storeAnchorMetadataTokenButton.disabled=false;

	/** Tab to get Granular Metadata to allow per triple/quad verification **/
	const readAnchoredRDFInputButton = document.querySelector("#readAnchoredRDFInputButton");
	readAnchoredRDFInputButton.disabled=false;
	const readAnchoredMetadataButton = document.querySelector("#readAnchoredMetadataButton");
	readAnchoredMetadataButton.disabled=false;
	const storeGanularMetadataButton = document.querySelector("#storeGanularMetadataButton");
	storeGanularMetadataButton.disabled=false;

	/** Tab to Validate with anchored metadata **/
	const readValidateRDFInputButton = document.querySelector("#readValidateRDFInputButton");
	readValidateRDFInputButton.disabled=false;
	const readAnchoredMetadataValidationButton = document.querySelector("#readAnchoredMetadataValidationButton");
	readAnchoredMetadataValidationButton.disabled=false;

	/** Tab to Validate with Granular metadata **/
	const readValidateGranularRDFInputButton = document.querySelector("#readValidateGranularRDFInputButton");
	readValidateGranularRDFInputButton.disabled=false;
	const readGranularMetadataValidationButton = document.querySelector("#readGranularMetadataValidationButton");
	readGranularMetadataValidationButton.disabled=false;

}

function disableSolidButtons() {


	document.querySelector("#solidpod").innerHTML="";
	const solidLogoutButton = document.querySelector("#solidLogoutButton");
	solidLogoutButton.disabled=true;

	/** Tab to connect to Solid and view files **/
	const solidLoginButton = document.querySelector("#solidLoginButton");
	solidLoginButton.disabled=false;

	const readFileFromSolidButton = document.querySelector("#readFileFromSolidButton");
	readFileFromSolidButton.disabled=true;

	/** Tab to get Verification Metadata for some RDF Input **/
	const saveFileDataButton = document.querySelector("#saveFileDataButton");
	saveFileDataButton.disabled=true;
	const readSolidDataButton = document.querySelector("#readSolidDataButton");
	readSolidDataButton.disabled=true;
	const storeVerificationMetadataButton = document.querySelector("#storeVerificationMetadataButton");
	storeVerificationMetadataButton.disabled=true;

	/** Tab to Anchor Verification Metadata to the Blockchain **/
	const readVerificationMetadataButton = document.querySelector("#readVerificationMetadataButton");
	readVerificationMetadataButton.disabled=true;
	const saveVerificationMetadataFileButton = document.querySelector("#saveVerificationMetadataFileButton");
	saveVerificationMetadataFileButton.disabled=true;
	const storeAnchorMetadataButton = document.querySelector("#storeAnchorMetadataButton");
	storeAnchorMetadataButton.disabled=true;

	/** Tab to Anchor Verification Metadata to the Blockchain with a Token **/
	const readVerificationMetadataTokenButton = document.querySelector("#readVerificationMetadataTokenButton");
	readVerificationMetadataTokenButton.disabled=true;
	const saveVerificationMetadataTokenFileButton = document.querySelector("#saveVerificationMetadataTokenFileButton");
	saveVerificationMetadataTokenFileButton.disabled=true;
	const storeAnchorMetadataTokenButton = document.querySelector("#storeAnchorMetadataTokenButton");
	storeAnchorMetadataTokenButton.disabled=true;

	/** Tab to get Granular Metadata to allow per triple/quad verification **/
	const readAnchoredRDFInputButton = document.querySelector("#readAnchoredRDFInputButton");
	readAnchoredRDFInputButton.disabled=true;
	const readAnchoredMetadataButton = document.querySelector("#readAnchoredMetadataButton");
	readAnchoredMetadataButton.disabled=true;
	const storeGanularMetadataButton = document.querySelector("#storeGanularMetadataButton");
	storeGanularMetadataButton.disabled=true;

	/** Tab to Validate with anchored metadata **/
	const readValidateRDFInputButton = document.querySelector("#readValidateRDFInputButton");
	readValidateRDFInputButton.disabled=true;
	const readAnchoredMetadataValidationButton = document.querySelector("#readAnchoredMetadataValidationButton");
	readAnchoredMetadataValidationButton.disabled=true;

	/** Tab to Validate with Granular metadata **/
	const readValidateGranularRDFInputButton = document.querySelector("#readValidateGranularRDFInputButton");
	readValidateGranularRDFInputButton.disabled=true;
	const readGranularMetadataValidationButton = document.querySelector("#readGranularMetadataValidationButton");
	readGranularMetadataValidationButton.disabled=true;

}


function clearAll() {

	//Get Verification Metadata for some RDF Input
	document.getElementById('solidFileURL').value = "";
	document.getElementById('inputarea').value = "";
	document.getElementById('verificationMetadataResult').value = "";
	document.getElementById('verificationMetadataTitle').value = "";
	document.getElementById('verificationMetadataSolidURLResult').innerHTML = "";

	// Anchor Verification Metadata to the Blockchain with a Contract
	document.getElementById('verificationMetadataInputURL').value = "";
	document.getElementById('verificationmetadatainputarea').value = "";
	document.getElementById('anchorMetadataResult').value = "";
	document.getElementById('anchorMetadataTitle').value = "";
	document.getElementById('anchorMetadataSolidURLResult').innerHTML = "";

	// Anchor Verification Metadata to the Blockchain with a Token
	document.getElementById('verificationMetadataTokenInputURL').value = "";
	document.getElementById('verificationmetadataTokeninputarea').value = "";
	document.getElementById('anchorMetadataTokenResult').value = "";
	document.getElementById('anchorMetadataTokenTitle').value = "";
	document.getElementById('anchorMetadataTokenSolidURLResult').innerHTML = "";
	// prepopulate the token icon with the default
	document.getElementById('tokenName').value = "";
	document.getElementById('tokenDescription').value = "";
	document.getElementById('tokenImageURL').value = cfg.tokenIconURL;

	// Get Granular Metadata to allow per triple/quad verification
	document.getElementById('anchoredRDFInputURL').value = "";
	document.getElementById('anchoredRDFInputArea').value = "";
	document.getElementById('anchoredMetadataInputURL').value = "";
	document.getElementById('anchoredMetadataInputArea').value = "";
	document.getElementById('granularVerificationMetadataResult').value = "";
	document.getElementById('granularMetadataTitle').value = "";
	document.getElementById('granularVerificationMetadataSolidURLResult').innerHTML = "";

	// Validate RDF Data
	document.getElementById('validateRDFInputURL').value = "";
	document.getElementById('validateRDFInputArea').value = "";
	document.getElementById('validateAnchoredMetadataInputURL').value = "";
	document.getElementById('anchoredMetadataValidationInputArea').value = "";
	document.getElementById('validateResult').value = "";

	// Validate RDF Data - Granular
	document.getElementById('validateGranularRDFInputURL').value = "";
	document.getElementById('validateGranularRDFInputArea').value = "";
	document.getElementById('validateGranularMetadataInputURL').value = "";
	document.getElementById('granularMetadataValidationInputArea').value = "";
	document.getElementById('validateGranularResult').value = "";
}

var totalTabs = 0;
var currentTab = 0;

function tabClick() {
	const acollection = document.getElementsByClassName("nav-link active"); // currently active tab anchor - should only be 1
	const currentLi = acollection[0].parentElement;
	const nodes = Array.prototype.slice.call( document.getElementById('thedemotabs').children );
	currentTab = nodes.indexOf(currentLi);
	showHideControls();
}

function showHideControls(){

	const nextButton = document.getElementById('ntxbtn');
	const previousButton = document.getElementById('prevbtn');

	previousButton.style.display = "inline-block";
	nextButton.style.display = "inline-block";

	if (currentTab == 0){
		previousButton.style.display = "none";
	}
	if (currentTab == (totalTabs-1)){
		nextButton.style.display = "none";
	}
}

/**
 * Initialise buttons and web3 etc.
 */
function initLinkchain() {

	totalTabs = document.getElementById("thedemotabs").getElementsByTagName("li").length;

	linkchains = window.linkchains();
	console.log(linkchains);

	ethereum = window.ethereum;

	// A Web3Provider wraps a standard Web3 provider, which is
	// what MetaMask injects as window.ethereum into each page
	provider = new ethers.providers.Web3Provider(window.ethereum)
	console.log('provider:', provider);

	// The MetaMask plugin also allows signing transactions to
	// send ether and pay to change state within the blockchain.
	// For this, you need the account signer...
	signer = provider.getSigner();
	console.log('signer:', signer);

	// Check if logged into MetaMask already
	if (typeof ethereum !== 'undefined') {

		if (ethereum.isMetaMask) {
			console.log('MetaMask is installed');
		}

		console.log("ethereum.networkVersion: " + ethereum.networkVersion);
		console.log("ethereum.selectedAddress: " + ethereum.selectedAddress);

		if (ethereum.selectedAddress == "" || ethereum.selectedAddress == null) {
			const button = document.getElementById('enableEthereumButton');
			button.disabled = false;
		} else {
			const button = document.getElementById('enableEthereumButton');
			button.disabled = true;
			enableMetaMaskButtons();
			account = ethereum.selectedAddress;
			document.getElementById('ethereumaccount').innerHTML = account;
		}
	} else {
		const button = document.getElementById('enableEthereumButton');
		button.disabled = false;
		console.log('MetaMask needs to be installed');
	}

	// prepopulate the token icon with the default
	document.getElementById('tokenImageURL').value = cfg.tokenIconURL;

	const podURLInput = document.getElementById("PodURL");
	podURLInput.onchange = function() {

		let data = this.value;
		if (data == "") {
			data = '<span style="color:gray">Please add Solid Pod URL on tab 1</span>';
		}

		document.getElementById("verificationMetadataStub").innerHTML = data;
		document.getElementById("anchorMetadataStub").innerHTML = data;
		document.getElementById("anchorMetadataTokenStub").innerHTML = data;
		document.getElementById("granularVerificationMetadataStub").innerHTML = data;

		localStorage.setItem("podurl", data);
	};
	// pull out of storage the previously saved podurl
	if (localStorage.getItem("podurl")) {
		podURLInput.value = localStorage.getItem("podurl");
		podURLInput.onchange();
	}

	// READ IN LOCAL FILES
	const readFileDataButton = document.querySelector("#readFileDataButton");
	readFileDataButton.onclick = function() {
		readLocalInputData('fileoftriples', 'inputarea', ['anchoredRDFInputArea', 'validateRDFInputArea', 'validateGranularRDFInputArea']);
	};

	const readVerificationMetadataFileButton = document.querySelector("#readVerificationMetadataFileButton");
	readVerificationMetadataFileButton.onclick = async function() {
		readLocalInputData('verificationMetadataFile', 'verificationmetadatainputarea', []);
	};

	// Granular
	const granularRDFInputFileButton = document.querySelector("#granularRDFInputFileButton");
	granularRDFInputFileButton.onclick = async function() {
		readLocalInputData('granularRDFInputFile', 'anchoredRDFInputArea', []);
	};

	const anchoredMetadataInputAreaButton = document.querySelector("#anchoredMetadataInputAreaButton");
	anchoredMetadataInputAreaButton.onclick = async function() {
		readLocalInputData('anchoredMetadataInputAreaFile', 'anchoredMetadataInputArea', []);
	};


	// Validation
	const validateRDFInputFileButton = document.querySelector("#validateRDFInputFileButton");
	validateRDFInputFileButton.onclick = async function() {
		readLocalInputData('validateRDFInputFile', 'validateRDFInputArea', []);
	};

	const validateAnchoredMetadataInputFileButton = document.querySelector("#validateAnchoredMetadataInputFileButton");
	validateAnchoredMetadataInputFileButton.onclick = async function() {
		readLocalInputData('validateAnchoredMetadataInputFile', 'anchoredMetadataValidationInputArea', []);
	};

	// Granular Validation
	const validateGranularRDFInputButton = document.querySelector("#validateGranularRDFInputButton");
	validateGranularRDFInputButton.onclick = async function() {
		readLocalInputData('validateGranularRDFInputFile', 'validateGranularRDFInputArea', []);
	};

	const granularMetadataValidationInputButton = document.querySelector("#granularMetadataValidationInputButton");
	granularMetadataValidationInputButton.onclick = async function() {
		readLocalInputData('granularMetadataValidationInputFile', 'granularMetadataValidationInputArea', []);
	};

	const ethereumButton = document.getElementById('enableEthereumButton');
	ethereumButton.onclick = async function() {
		loginToMetaMask();
	};

	const verificationMetaDataButton = document.getElementById('verificationMetadataButton');
	verificationMetaDataButton.onclick = function() {
		getVerificationMetadata();
	};

	const anchorMetadataButton = document.getElementById('anchorMetadataButton');
	anchorMetadataButton.onclick = function() {
		anchorMetadata();
	};

	const anchorMetadataTokenButton = document.getElementById('anchorMetadataTokenButton');
	anchorMetadataTokenButton.onclick = function() {
		anchorMetadataWithToken();
	};

	const granularVerificationMetaDataButton = document.getElementById('granularVerificationMetadataButton');
	granularVerificationMetaDataButton.onclick = function() {
		getGranularVerificationMetadata();
	};

	const validateButton = document.getElementById('validateButton');
	validateButton.onclick = function() {
		validate();
	};

	const validateGranularButton = document.getElementById('validateGranularButton');
	validateGranularButton.onclick = function() {
		validateGranular();
	};

	// ADMIN
	const tokenContractButton = document.getElementById('tokenContractButton');
	tokenContractButton.onclick = async function() {
		let result = await deployTokenAnchorContract('tokenContractOutput');
		document.getElementById('tokenContractOutput').value = JSON.stringify(result, null, 2);
	};

	//const clearButton = document.getElementById('clearButton');
	//clearButton.onclick = function() {
	//	clearAll();
	//};

	const nextButton = document.getElementById('ntxbtn');
	nextButton.onclick = function(e) {
		try {
			e.preventDefault();

			const acollection = document.getElementsByClassName("nav-link active"); // currently active tab anchor - should only be 1
			const currentLi = acollection[0].parentElement;
			const nextLi = currentLi.nextElementSibling;
			const nodes = Array.prototype.slice.call( document.getElementById('thedemotabs').children );
			currentTab = nodes.indexOf(currentLi);
			currentTab +=1;

			if (nextLi != null) {
				nextLi.firstElementChild.click();
			}

			showHideControls();
		} catch (error) {
			console.log(e);
		}
	};

	const previousButton = document.getElementById('prevbtn');
	previousButton.onclick = function(e) {

		try {
			e.preventDefault();

			const acollection = document.getElementsByClassName("nav-link active"); // currently active tab anchor - should only be 1
			const currentLi = acollection[0].parentElement;
			const previousLi = currentLi.previousElementSibling;
			const nodes = Array.prototype.slice.call( document.getElementById('thedemotabs').children );
			currentTab = nodes.indexOf(previousLi);
			currentTab -=1;

			if (previousLi != null) {
				previousLi.firstElementChild.click();
			}

			showHideControls();
		} catch (error) {
			console.log(e);
		}
	};


	/**** INRUPT/SOLID RELATED BUTTONS *****/

	/** Tab to connect to Solid and view files **/

	const solidLoginButton = document.querySelector("#solidLoginButton");
	solidLoginButton.onclick = function() {
		Inrupt.startSolidLogin();
	};

	const solidLogoutButton = document.querySelector("#solidLogoutButton");
	solidLogoutButton.onclick = function() {
		Inrupt.solidLogout();
	};

	const readFileFromSolidButton = document.querySelector("#readFileFromSolidButton");
	readFileFromSolidButton.onclick = async function() {
		try {
			const podUrl = document.getElementById("PodURL").value;
			const allFolderArray = await Inrupt.loadFolderContentList(podUrl);

			const filesArea = document.getElementById("filesArea");
			let allFiles = ""
			allFolderArray.forEach(function(filename) {
				allFiles += filename+'\n';
			});

			filesArea.value = allFiles;

		} catch (error) {
			console.log(error);
			alert(error.message);
		}
	};


	/** Tab to get Verification Metadata for some RDF Input **/

	const readSolidDataButton = document.querySelector("#readSolidDataButton");
	readSolidDataButton.onclick = async function() {
		const fileURL = document.getElementById("solidFileURL").value;
		const file = await Inrupt.readFileFromPod(fileURL);

		//console.log(file);

		let reader = new FileReader();
		reader.readAsText(file);
		reader.onload = function() {
			console.log(reader.result);
			const inputarea = document.getElementById('inputarea');
			inputarea.value = reader.result;
		};
	};

	const saveFileDataButton = document.querySelector("#saveFileDataButton");
	saveFileDataButton.onclick = async function() {
		try {
			const podUrl = document.getElementById("PodURL").value;
			const file = document.getElementById('fileoftriples').files[0];
			if (file) {
				const filePodURL = podUrl+file.name;
				await Inrupt.writeFileToPod(file, `${filePodURL}`);
				const solidFileURLField = document.getElementById("solidFileURL").value = filePodURL;
			}
		} catch (error) {
			console.log(error);
			alert(error.message);
		}
	}

	const storeVerificationMetadataButton = document.querySelector("#storeVerificationMetadataButton");
	storeVerificationMetadataButton.onclick = async function() {
		try {
			const data = document.getElementById("verificationMetadataResult").value;
			if (data == "") {
				alert("Please load some data into the textarea to store to solid");
				return;
			}
			const title =  document.getElementById("verificationMetadataTitle").value;
			if (title == "") {
				alert("Please give this dataset a title to use in Solid");
				return;
			}

			const filename = title.replace(/[^\-a-z0-9]/gi, '_').toLowerCase();
			const pathToStore = document.getElementById("PodURL").value+filename+'.jsonld';
			const filetype = 'text/plain'; // must be this or fails - no idea why
			const blob = new Blob([data], { type: filetype });
			const file = new File([blob], filename, { type: filetype });
			const fileurl = await Inrupt.writeFileToPod(file, pathToStore);

			document.getElementById("verificationMetadataSolidURLResult").innerHTML = fileurl;
			document.getElementById("verificationMetadataInputURL").value = fileurl;
			document.getElementById("verificationMetadataTokenInputURL").value = fileurl;
		} catch (error) {
			console.log(error);
			alert(error.message);
		}
	};

	/** Tab to Anchor Verification Metadata to the Blockchain **/

	const saveVerificationMetadataFileButton = document.querySelector("#saveVerificationMetadataFileButton");
	saveVerificationMetadataFileButton.onclick = async function() {
		try {
			const podUrl = document.getElementById("PodURL").value;
			const file = document.getElementById('verificationMetadataFile').files[0];
			if (file) {
				const filePodURL = podUrl+file.name;
				await Inrupt.writeFileToPod(file, `${filePodURL}`);
				const solidFileURLField = document.getElementById("verificationMetadataInputURL").value = filePodURL;
			}
		} catch (error) {
			console.log(error);
			alert(error.message);
		}
	}

	const readVerificationMetadataButton = document.querySelector("#readVerificationMetadataButton");
	readVerificationMetadataButton.onclick = async function() {
		const fileURL = document.getElementById("verificationMetadataInputURL").value;
		const file = await Inrupt.readFileFromPod(fileURL);

		let reader = new FileReader();
		reader.readAsText(file);
		reader.onload = function() {
			const inputarea = document.getElementById('verificationmetadatainputarea');
			inputarea.value = reader.result;
		};
	}

	const storeAnchorMetadataButton = document.querySelector("#storeAnchorMetadataButton");
	storeAnchorMetadataButton.onclick = async function() {
		try {
			const data = document.getElementById("anchorMetadataResult").value;
			if (data == "") {
				alert("Please load some data into the textarea to store to solid");
				return;
			}
			const title =  document.getElementById("anchorMetadataTitle").value;
			if (title == "") {
				alert("Please give this dataset a title to use in Solid");
				return;
			}

			const filename = title.replace(/[^\-a-z0-9]/gi, '_').toLowerCase();
			const pathToStore = document.getElementById("PodURL").value+filename+'.jsonld';
			const filetype = 'text/plain'; // must be this or fails - no idea why
			const blob = new Blob([data], { type: filetype });
			const file = new File([blob], filename, { type: filetype });
			const fileurl = await Inrupt.writeFileToPod(file, pathToStore);

			document.getElementById("anchorMetadataSolidURLResult").innerHTML = fileurl;
			document.getElementById("anchoredMetadataInputURL").value = fileurl;
		} catch (error) {
			console.log(error);
			alert(error.message);
		}
	};

	/** Tab to Anchor Verification Metadata to the Blockchain with Tokens **/

	const saveVerificationMetadataTokenFileButton = document.querySelector("#saveVerificationMetadataTokenFileButton");
	saveVerificationMetadataTokenFileButton.onclick = async function() {
		try {
			const podUrl = document.getElementById("PodURL").value;
			const file = document.getElementById('verificationMetadataTokenFile').files[0];
			if (file) {
				const filePodURL = podUrl+file.name;
				await Inrupt.writeFileToPod(file, `${filePodURL}`);
				const solidFileURLField = document.getElementById("verificationMetadataTokenInputURL").value = filePodURL;
			}
		} catch (error) {
			console.log(error);
			alert(error.message);
		}
	}

	const readVerificationMetadataTokenButton = document.querySelector("#readVerificationMetadataTokenButton");
	readVerificationMetadataTokenButton.onclick = async function() {
		const fileURL = document.getElementById("verificationMetadataTokenInputURL").value;
		const file = await Inrupt.readFileFromPod(fileURL);

		let reader = new FileReader();
		reader.readAsText(file);
		reader.onload = function() {
			const inputarea = document.getElementById('verificationMetadataTokenInputArea');
			inputarea.value = reader.result;
		};
	}

	const storeAnchorMetadataTokenButton = document.querySelector("#storeAnchorMetadataTokenButton");
	storeAnchorMetadataTokenButton.onclick = async function() {
		try {
			const data = document.getElementById("anchorMetadataTokenResult").value;
			if (data == "") {
				alert("Please load some data into the textarea to store to solid");
				return;
			}
			const title =  document.getElementById("anchorMetadataTokenTitle").value;
			if (title == "") {
				alert("Please give this dataset a title to use in Solid");
				return;
			}

			const filename = title.replace(/[^\-a-z0-9]/gi, '_').toLowerCase();
			const pathToStore = document.getElementById("PodURL").value+filename+'.jsonld';
			const filetype = 'text/plain'; // must be this or fails - no idea why
			const blob = new Blob([data], { type: filetype });
			const file = new File([blob], filename, { type: filetype });
			const fileurl = await Inrupt.writeFileToPod(file, pathToStore);

			document.getElementById("anchorMetadataTokenSolidURLResult").innerHTML = fileurl;
			document.getElementById("anchoredMetadataInputURL").value = fileurl;
		} catch (error) {
			console.log(error);
			alert(error.message);
		}
	};

	/** Tab to get Granular Metadata to allow per triple/quad verification **/

	const readAnchoredRDFInputButton = document.querySelector("#readAnchoredRDFInputButton");
	readAnchoredRDFInputButton.onclick = async function() {
		const fileURL = document.getElementById("anchoredRDFInputURL").value;

		const file = await Inrupt.readFileFromPod(fileURL);

		let reader = new FileReader();
		reader.readAsText(file);
		reader.onload = function() {
			const inputarea = document.getElementById('anchoredRDFInputArea');
			inputarea.value = reader.result;
		};
	}

	const readAnchoredMetadataButton = document.querySelector("#readAnchoredMetadataButton");
	readAnchoredMetadataButton.onclick = async function() {
		const fileURL = document.getElementById("anchoredMetadataInputURL").value;

		const file = await Inrupt.readFileFromPod(fileURL);

		let reader = new FileReader();
		reader.readAsText(file);
		reader.onload = function() {
			const inputarea = document.getElementById('anchoredMetadataInputArea');
			inputarea.value = reader.result;
		};
	}

	const storeGanularMetadataButton = document.querySelector("#storeGanularMetadataButton");
	storeGanularMetadataButton.onclick = async function() {
		try {
			const data = document.getElementById("granularVerificationMetadataResult").value;
			if (data == "") {
				alert("Please load some data into the textarea to store to solid");
				return;
			}
			const title =  document.getElementById("granularVerificationMetadataTitle").value;
			if (title == "") {
				alert("Please give this dataset a title to use in Solid");
				return;
			}

			let filename = title.replace(/[^\-a-z0-9]/gi, '_').toLowerCase();
			filename = filename+'.jsonld';
			const pathToStore = document.getElementById("PodURL").value+filename;
			const filetype = 'text/plain'; // must be this or fails - no idea why
			const blob = new Blob([data], { type: filetype });
			const file = new File([blob], filename, { type: filetype });

			const fileurl = await Inrupt.writeFileToPod(file, pathToStore);

			document.getElementById("granularVerificationMetadataSolidURLResult").innerHTML = fileurl;
		} catch (error) {
			console.log(error);
			alert(error.message);
		}
	};

	/** Tab to Validate with anchored metadata **/

	const readValidateRDFInputButton = document.querySelector("#readValidateRDFInputButton");
	readValidateRDFInputButton.onclick = async function() {
		const fileURL = document.getElementById("validateRDFInputURL").value;
		const file = await Inrupt.readFileFromPod(fileURL);
		let reader = new FileReader();
		reader.readAsText(file);
		reader.onload = function() {
			const inputarea = document.getElementById('validateRDFInputArea');
			inputarea.value = reader.result;
		};
	}

	const readAnchoredMetadataValidationButton = document.querySelector("#readAnchoredMetadataValidationButton");
	readAnchoredMetadataValidationButton.onclick = async function() {
		const fileURL = document.getElementById("validateAnchoredMetadataInputURL").value;
		const file = await Inrupt.readFileFromPod(fileURL);

		let reader = new FileReader();
		reader.readAsText(file);
		reader.onload = function() {
			const inputarea = document.getElementById('anchoredMetadataValidationInputArea');
			inputarea.value = reader.result;
		};
	}

	/** Tab to Validate with Granular metadata **/

	const readValidateGranularRDFInputButton = document.querySelector("#readValidateGranularRDFInputButton");
	readValidateGranularRDFInputButton.onclick = async function() {
		const fileURL = document.getElementById("validateGranularRDFInputURL").value;
		const file = await Inrupt.readFileFromPod(fileURL);

		let reader = new FileReader();
		reader.readAsText(file);
		reader.onload = function() {
			const inputarea = document.getElementById('validateGranularRDFInputArea');
			inputarea.value = reader.result;
		};
	}


	const readGranularMetadataValidationButton = document.querySelector("#readGranularMetadataValidationButton");
	readGranularMetadataValidationButton.onclick = async function() {
		const fileURL = document.getElementById("validateGranularMetadataInputURL").value;
		const file = await Inrupt.readFileFromPod(fileURL);

		let reader = new FileReader();
		reader.readAsText(file);
		reader.onload = function() {
			const inputarea = document.getElementById('granularMetadataValidationInputArea');
			inputarea.value = reader.result;
		};
	}
}
