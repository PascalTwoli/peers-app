import { Space_Grotesk, Manrope } from "next/font/google";
import "./globals.css";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

const headingFont = Space_Grotesk({
	subsets: ["latin"],
	variable: "--font-heading",
});
const bodyFont = Manrope({ subsets: ["latin"], variable: "--font-body" });

export const metadata = {
	title: "Peers | Social Workspace",
	description:
		"Chat, call, create rooms, and collaborate in one social workspace.",
};

export default function RootLayout({ children }) {
	return (
		<html lang="en">
			<body className={`${headingFont.variable} ${bodyFont.variable}`}>
				<div className="site-bg">
					<Navbar />
					<main>{children}</main>
					<Footer />
				</div>
			</body>
		</html>
	);
}
