{
  description = "A basic Go 1.22 development environment";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = { self, nixpkgs, flake-utils }:
    flake-utils.lib.eachDefaultSystem (system:
      let
        pkgs = import nixpkgs { inherit system; };
      in
      {
        devShells.default = pkgs.mkShell {
          buildInputs = [
            pkgs.go_1_22
            pkgs.gopls
          ];

          shellHook = ''
            export GOPATH=$PWD/.go
            export PATH=$GOPATH/bin:$PATH
          '';
        };
      }
    );
}
