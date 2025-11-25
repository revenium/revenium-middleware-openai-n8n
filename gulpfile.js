const { src, dest, parallel } = require('gulp');

function buildNodeIcons() {
	return src('nodes/**/*.{svg,png}', { encoding: false })
		.pipe(dest('dist/nodes'));
}

function buildCredentialIcons() {
	return src('credentials/**/*.{svg,png}', { encoding: false })
		.pipe(dest('dist/credentials'));
}

function buildSrcCredentialIcons() {
	return src('credentials/**/*.{svg,png}', { encoding: false })
		.pipe(dest('dist/src/credentials'));
}

function buildCredentialIconSubdirs() {
	// Copy credential icons to subdirectories that match the icon path references
	return src('credentials/ReveniumOpenAI-v2.png', { encoding: false })
		.pipe(dest('dist/credentials/ReveniumOpenAIChatModel'));
}

const buildIcons = parallel(buildNodeIcons, buildCredentialIcons, buildSrcCredentialIcons, buildCredentialIconSubdirs);

exports['build:icons'] = buildIcons;
