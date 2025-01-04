import {createNft, mplTokenMetadata} from "@metaplex-foundation/mpl-token-metadata";
import {createGenericFile, generateSigner, keypairIdentity, percentAmount} from "@metaplex-foundation/umi";
import {createUmi} from "@metaplex-foundation/umi-bundle-defaults";
import {irysUploader} from "@metaplex-foundation/umi-uploader-irys";
import {airdropIfRequired, getExplorerLink, getKeypairFromFile} from "@solana-developers/helpers";
import {clusterApiUrl, Connection, LAMPORTS_PER_SOL} from "@solana/web3.js";
import {promises as fs} from "fs";
import * as path from "path";
import { fileURLToPath } from 'url';

// ES modules replacement for __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
    try {
        const connection = new Connection(clusterApiUrl("devnet"));

        const user = await getKeypairFromFile();

        await airdropIfRequired(
            connection,
            user.publicKey,
            1 * LAMPORTS_PER_SOL,
            0.1 * LAMPORTS_PER_SOL
        );

        console.log("Loaded user:", user.publicKey.toBase58());

        const umi = createUmi(clusterApiUrl("devnet")); // Fixed: pass URL directly instead of connection
        const umiKeypair = umi.eddsa.createKeypairFromSecretKey(user.secretKey);
        
        umi
            .use(keypairIdentity(umiKeypair))
            .use(mplTokenMetadata())
            .use(irysUploader());

        // Make sure collection.png exists in the same directory as the script
        const collectionImagePath = path.resolve(__dirname, "collection.png");
        
        try {
            const buffer = await fs.readFile(collectionImagePath);
            let file = createGenericFile(buffer, "collection.png", { // Fixed: use filename only
                contentType: "image/png",
            });
            
            console.log("Uploading image...");
            const [image] = await umi.uploader.upload([file]);
            console.log("Image URI:", image);

            console.log("Uploading metadata...");
            const uri = await umi.uploader.uploadJson({
                name: "My NFT Collection",
                symbol: "MNC",
                description: "My Collection description",
                image,
            });
            console.log("Collection offchain metadata URI:", uri);

            console.log("Creating NFT...");
            const collectionMint = generateSigner(umi);

            await createNft(umi, {
                mint: collectionMint,
                name: "My NFT Collection",
                uri,
                updateAuthority: umi.identity.publicKey,
                sellerFeeBasisPoints: percentAmount(0),
                isCollection: true,
            }).sendAndConfirm(umi, { send: { commitment: "finalized" } });

            const explorerLink = getExplorerLink(
                "address",
                collectionMint.publicKey,
                "devnet",
            );
            console.log(`Collection NFT: ${explorerLink}`);
            console.log(`Collection NFT address is: ${collectionMint.publicKey}`);
            console.log("✅ Finished successfully!");

        } catch (error) {
            if (error.code === 'ENOENT') {
                console.error("Error: collection.png not found. Please ensure the image exists in the same directory as the script.");
            } else {
                console.error("Error during NFT creation:", error);
            }
        }

    } catch (error) {
        console.error("Error:", error);
    }
}

main();