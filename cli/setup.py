"""
Tessera CLI setup script.
"""
from setuptools import setup, find_packages

setup(
    name="tessera-cli",
    version="1.0.0",
    description="CLI tool for Tessera dataset diversity visualization",
    author="Your Name",
    author_email="arpit.wpi@gmail.com",
    url="https://github.com/arpitg1304/tessera",
    packages=find_packages(),
    install_requires=[
        "click>=8.0.0",
        "httpx>=0.24.0",
        "h5py>=3.8.0",
        "numpy>=1.24.0",
    ],
    entry_points={
        "console_scripts": [
            "tessera=tessera_cli.cli:main",
        ],
    },
    python_requires=">=3.9",
    classifiers=[
        "Development Status :: 4 - Beta",
        "Environment :: Console",
        "Intended Audience :: Science/Research",
        "License :: OSI Approved :: MIT License",
        "Programming Language :: Python :: 3",
        "Programming Language :: Python :: 3.9",
        "Programming Language :: Python :: 3.10",
        "Programming Language :: Python :: 3.11",
        "Topic :: Scientific/Engineering :: Artificial Intelligence",
    ],
)
