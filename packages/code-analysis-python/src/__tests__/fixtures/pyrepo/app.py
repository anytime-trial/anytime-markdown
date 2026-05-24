from pkg.models import Dog, make_dog


class Puppy(Dog):
    def fetch(self) -> bool:
        return True


def adopt() -> Dog:
    pet = make_dog()
    return pet


def main() -> None:
    adopt()
    obj = Puppy()
    obj.fetch()
