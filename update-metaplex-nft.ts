import {
    createNft,
    fetchMetadataFromSeeds,
    updateV1,
    findMetadataPda,
    mplTokenMetadata,
} from "@metaplex-foundation/mpl-token-metadata";
import {
    createGenericFile,
    generateSigner,
    keypairIdentity,
    percentAmount,
    publicKey as UMIPublicKey,
} from "@metaplex-foundation/umi";
import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import { irysUploader } from "@metaplex-foundation/umi-uploader-irys";
import {
    airdropIfRequired,
    getExplorerLink,
    getKeypairFromFile,
} from "@solana-developers/helpers";
import { clusterApiUrl, Connection, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { promises as fs } from "fs";
import * as path from "path";

async function main() {
    try {
        // create a new connection to Solana's devnet cluster
        const connection = new Connection(clusterApiUrl("devnet"));
        
        // load keypair from local file system
        const user = await getKeypairFromFile();
        console.log("Loaded user:", user.publicKey.toBase58());
        
        await airdropIfRequired(
            connection,
            user.publicKey,
            1 * LAMPORTS_PER_SOL,
            0.1 * LAMPORTS_PER_SOL,
        );
        
        const umi = createUmi(connection);
        
        // convert to umi compatible keypair
        const umiKeypair = umi.eddsa.createKeypairFromSecretKey(user.secretKey);
        
        // load our plugins and signer
        umi
            .use(keypairIdentity(umiKeypair))
            .use(mplTokenMetadata())
            .use(irysUploader());

        // Define the mint address of the NFT you want to update
        const mint = UMIPublicKey("34m4FAxT2UqaCnXT1b7yyXKVWM6kHMHL4fEDE8SQzbpD");
        
        // Load the existing NFT metadata
        const nft = await fetchMetadataFromSeeds(umi, { mint });
        console.log("Found existing NFT metadata");

        // Upload new image
        const NFTImagePath = path.resolve(__dirname, "nft.png");
        const buffer = await fs.readFile(NFTImagePath);
        let file = createGenericFile(buffer, NFTImagePath, {
            contentType: "image/png",
        });
        
        // upload new image and get image uri
        const [image] = await umi.uploader.upload([file]);
        console.log("New image uri:", image);
        
        // upload updated offchain json using irys and get metadata uri
        const uri = await umi.uploader.uploadJson({
            name: "Updated Asset",
            symbol: "UPDATED",
            description: "Updated Description",
            image,
        });
        console.log("Updated NFT offchain metadata URI:", uri);
        
        // Update the NFT metadata
        await updateV1(umi, {
            mint,
            authority: umi.identity,
            data: {
                ...nft,
                name: "Updated Asset",
                symbol: "UPDATED",
                uri: uri, // Add the new URI
                sellerFeeBasisPoints: percentAmount(0),
            },
            primarySaleHappened: true,
            isMutable: true,
        }).sendAndConfirm(umi);
        
        let explorerLink = getExplorerLink("address", mint, "devnet");
        console.log(`NFT updated with new metadata URI: ${explorerLink}`);
        
        console.log("✅ Finished successfully!");

    } catch (error) {
        console.error("Error updating NFT:", error);
    }
}

main();