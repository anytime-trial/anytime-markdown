class Animal:
    def speak(self) -> str:
        return "?"


class Dog(Animal):
    def speak(self) -> str:
        return "woof"


GREETING = "hi"


def make_dog() -> Dog:
    return Dog()
