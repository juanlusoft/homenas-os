BINARY_NAME=homenas-agent
VERSION=$(shell git describe --tags --always --dirty 2>/dev/null || echo "dev")
LDFLAGS=-s -w -X main.version=$(VERSION)

.PHONY: all build-windows build-linux build-mac clean tidy

all: build-windows build-linux build-mac

tidy:
	go mod tidy

build-windows:
	GOOS=windows GOARCH=amd64 CGO_ENABLED=0 \
		go build -ldflags="$(LDFLAGS) -H windowsgui" -o build/$(BINARY_NAME).exe .
	@echo "Built build/$(BINARY_NAME).exe"

build-linux:
	GOOS=linux GOARCH=amd64 CGO_ENABLED=0 \
		go build -ldflags="$(LDFLAGS)" -o build/$(BINARY_NAME)-linux .
	@echo "Built build/$(BINARY_NAME)-linux"

build-mac:
	GOOS=darwin GOARCH=arm64 CGO_ENABLED=0 \
		go build -ldflags="$(LDFLAGS)" -o build/$(BINARY_NAME)-mac-arm64 .
	GOOS=darwin GOARCH=amd64 CGO_ENABLED=0 \
		go build -ldflags="$(LDFLAGS)" -o build/$(BINARY_NAME)-mac-amd64 .
	@echo "Built Mac binaries"

# Build for current platform (dev/testing)
build:
	go build -ldflags="$(LDFLAGS)" -o build/$(BINARY_NAME) .

clean:
	rm -rf build/
